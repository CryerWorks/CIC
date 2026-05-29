import type { SqlExecutor } from "../executor";
import { SessionSchema, type Session } from "../models/session";
import { SessionAssignmentSchema, type SessionAssignment } from "../models/links";
import { PretestResponseSchema, type PretestResponse } from "../models/pretestResponse";
import { SessionCardDraftSchema, type SessionCardDraft } from "../models/sessionCardDraft";
import type { AssignmentKind } from "../models/enums";
import { insert, selectParsed, update } from "./query";
import { createCard } from "./cards";
import { addCardResource } from "./cardResources";

/**
 * Daily Loop session repository (Feature 012, PRD F2) — **two-phase**. A session is *established*
 * (planned) via `planSession`, then *done* via `finalizeSession` (which UPDATEs it to completed).
 * `sessions.status` ('planned' | 'completed') is added in `m0006`; `session_assignments`,
 * `pretest_responses`, and `session_card_drafts` are children. Sessions are vault-scoped
 * transitively via `course → domain.vault_id` (research R3) — no `sessions.vault_id`.
 */

export interface AssignmentInput {
  resourceId: string;
  locator: string | null;
  kind: AssignmentKind;
}

export interface CardDraftInput {
  front: string;
  back: string;
}

export interface PlanInput {
  /** Optional caller-minted id so a precomputed writeup path's short-id matches the session. */
  id?: string;
  courseId: string;
  objective: string;
  assignments: AssignmentInput[];
  /** Pretest questions only — answers are recorded while doing the session. */
  pretestQuestions: string[];
  cardDrafts: CardDraftInput[];
}

export interface PretestAnswer {
  id: string;
  userResponse: string | null;
  revealedAfter?: boolean;
}

export interface CardCompletion {
  front: string;
  back: string;
}

export interface FinalizeInput {
  /** The planned session being done (R12 — finalize UPDATEs, it never inserts). */
  sessionId: string;
  minutes: number;
  didRetrieval: boolean;
  writeupPath: string | null;
  pretestAnswers: PretestAnswer[];
  cards: CardCompletion[];
  /** The atomic note authored this session (if any) — linked as the materialized cards' note. */
  notePath?: string | null;
}

export interface SessionListItem {
  session: Session;
  courseTitle: string;
}

/**
 * Establish a planned session and its children atomically (FR-006). Writes **nothing** to the
 * vault and creates **no** review cards — those happen on finish. Returns the planned `Session`.
 */
export async function planSession(db: SqlExecutor, input: PlanInput): Promise<Session> {
  const id = input.id ?? crypto.randomUUID();
  const rawSession = {
    id,
    course_id: input.courseId,
    project_id: null as string | null,
    date: new Date().toISOString(),
    objective: input.objective,
    minutes: 0,
    did_retrieval: 0,
    writeup_path: null as string | null,
    status: "planned" as const,
    completed_at: null as string | null,
  };

  await db.transaction(async (tx) => {
    await insert(tx, "sessions", rawSession);

    for (const a of input.assignments) {
      await insert(tx, "session_assignments", {
        id: crypto.randomUUID(),
        session_id: id,
        resource_id: a.resourceId,
        locator: a.locator,
        assignment_kind: a.kind,
      });
    }

    for (const question of input.pretestQuestions) {
      await insert(tx, "pretest_responses", {
        id: crypto.randomUUID(),
        session_id: id,
        question,
        user_response: null,
        revealed_after: 0,
      });
    }

    for (let i = 0; i < input.cardDrafts.length; i++) {
      const c = input.cardDrafts[i];
      await insert(tx, "session_card_drafts", {
        id: crypto.randomUUID(),
        session_id: id,
        front: c.front,
        back: c.back,
        order_index: i,
      });
    }
  });

  return SessionSchema.parse(rawSession);
}

/**
 * Finish a planned session: flip it to **completed**, record its pretest answers, materialize its
 * completed card prompts into **new** cards, and remove the staged drafts — all in one transaction
 * (truly atomic on the node adapter; best-effort on the pooled production adapter). Cards are
 * created via `createCard` (so `fsrs_state` is null — new) and cite the session's assignments,
 * **deduped by resourceId (first locator wins)** so a resource cited by two assignments never
 * attempts two `card_resources` rows for the same `(card_id, resource_id)`. The vault writeup is
 * written by the caller **after** this resolves (research R7).
 */
export async function finalizeSession(db: SqlExecutor, input: FinalizeInput): Promise<Session> {
  const existing = await getSession(db, input.sessionId);
  if (!existing) throw new Error(`Session ${input.sessionId} not found`);

  const assignments = await listSessionAssignments(db, input.sessionId);
  const noteCites = dedupeByResource(assignments);
  const completedAt = new Date().toISOString();

  await db.transaction(async (tx) => {
    await update(
      tx,
      "sessions",
      {
        status: "completed",
        minutes: input.minutes,
        did_retrieval: input.didRetrieval ? 1 : 0,
        writeup_path: input.writeupPath,
        completed_at: completedAt,
      },
      { id: input.sessionId },
    );

    for (const ans of input.pretestAnswers) {
      await update(
        tx,
        "pretest_responses",
        { user_response: ans.userResponse, revealed_after: ans.revealedAfter ? 1 : 0 },
        { id: ans.id },
      );
    }

    for (const card of input.cards) {
      const created = await createCard(tx, {
        courseId: existing.course_id,
        front: card.front,
        back: card.back,
        notePath: input.notePath ?? null,
      });
      for (const cite of noteCites) {
        await addCardResource(tx, {
          cardId: created.id,
          resourceId: cite.resource_id,
          locator: cite.locator,
        });
      }
    }

    await tx.execute("DELETE FROM session_card_drafts WHERE session_id = ?", [input.sessionId]);
  });

  return SessionSchema.parse({
    ...existing,
    status: "completed",
    minutes: input.minutes,
    did_retrieval: input.didRetrieval ? 1 : 0,
    writeup_path: input.writeupPath,
    completed_at: completedAt,
  });
}

/** Assignments collapsed to one `{ resource_id, locator }` per resource (first locator wins) so a
 *  card's `card_resources` can never collide on its `(card_id, resource_id)` PK (finding D1). */
function dedupeByResource(
  assignments: SessionAssignment[],
): { resource_id: string; locator: string | null }[] {
  const seen = new Set<string>();
  const out: { resource_id: string; locator: string | null }[] = [];
  for (const a of assignments) {
    if (seen.has(a.resource_id)) continue;
    seen.add(a.resource_id);
    out.push({ resource_id: a.resource_id, locator: a.locator });
  }
  return out;
}

const VAULT_JOIN = `JOIN courses c ON c.id = s.course_id JOIN domains d ON d.id = c.domain_id`;

async function listByVault(
  db: SqlExecutor,
  vaultId: string,
  status: "planned" | "completed" | null,
  limit?: number,
): Promise<SessionListItem[]> {
  const params: (string | number)[] = [vaultId];
  let where = "WHERE d.vault_id = ?";
  if (status) {
    where += " AND s.status = ?";
    params.push(status);
  }
  const limitClause = limit ? " LIMIT ?" : "";
  if (limit) params.push(limit);
  const rows = await db.select<Record<string, unknown>>(
    `SELECT s.*, c.title AS _course_title
     FROM sessions s ${VAULT_JOIN}
     ${where}
     ORDER BY COALESCE(s.completed_at, s.date) DESC${limitClause}`,
    params,
  );
  return rows.map((row) => {
    const { _course_title, ...session } = row;
    return {
      session: SessionSchema.parse(session),
      courseTitle: (_course_title as string | null) ?? "",
    };
  });
}

/** The active vault's **planned** sessions (the Daily Loop "to do" list), newest first. */
export function listPlannedSessions(
  db: SqlExecutor,
  vaultId: string,
  opts?: { limit?: number },
): Promise<SessionListItem[]> {
  return listByVault(db, vaultId, "planned", opts?.limit);
}

/** The active vault's sessions (defaults to all; pass `status` to filter), newest first. */
export function listSessionsByVault(
  db: SqlExecutor,
  vaultId: string,
  opts?: { limit?: number; status?: "planned" | "completed" },
): Promise<SessionListItem[]> {
  return listByVault(db, vaultId, opts?.status ?? null, opts?.limit);
}

/** A Course's planned sessions (the Course-detail "Sessions" section), newest first. */
export function listPlannedSessionsByCourse(db: SqlExecutor, courseId: string): Promise<Session[]> {
  return selectParsed(
    db,
    SessionSchema,
    "SELECT * FROM sessions WHERE course_id = ? AND status = 'planned' ORDER BY date DESC",
    [courseId],
  );
}

export async function getSession(db: SqlExecutor, id: string): Promise<Session | null> {
  const rows = await selectParsed(db, SessionSchema, "SELECT * FROM sessions WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export function listSessionAssignments(
  db: SqlExecutor,
  sessionId: string,
): Promise<SessionAssignment[]> {
  return selectParsed(
    db,
    SessionAssignmentSchema,
    "SELECT * FROM session_assignments WHERE session_id = ? ORDER BY rowid",
    [sessionId],
  );
}

export function listPretestResponses(
  db: SqlExecutor,
  sessionId: string,
): Promise<PretestResponse[]> {
  return selectParsed(
    db,
    PretestResponseSchema,
    "SELECT * FROM pretest_responses WHERE session_id = ? ORDER BY rowid",
    [sessionId],
  );
}

export function listSessionCardDrafts(
  db: SqlExecutor,
  sessionId: string,
): Promise<SessionCardDraft[]> {
  return selectParsed(
    db,
    SessionCardDraftSchema,
    "SELECT * FROM session_card_drafts WHERE session_id = ? ORDER BY order_index",
    [sessionId],
  );
}

/** Delete a **planned** session (cascade removes its assignments/pretest/drafts). Refuses to touch
 *  a completed session (FR-007). */
export async function deletePlannedSession(db: SqlExecutor, sessionId: string): Promise<void> {
  await db.execute("DELETE FROM sessions WHERE id = ? AND status = 'planned'", [sessionId]);
}
