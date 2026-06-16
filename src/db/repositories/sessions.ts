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
  /** The Course Milestone this session advances (Feature 013, optional). Restricted to the
   *  Course's own Milestones by the caller/UI — the column FK only guarantees a valid id. */
  milestoneId?: string | null;
  /** The Project this session is a work block for (Feature 015, optional). Planning against an
   *  `open` Project flips it to `in-progress` (FR-009/FR-010). */
  projectId?: string | null;
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
 * vault and creates **no** review cards — those happen on finish. The session is appended to the
 * end of its Course's curriculum sequence (`order_index = MAX+1`, Feature 013 R5/FR-003) and may
 * carry an optional `milestone_id`. Returns the planned `Session`.
 */
export async function planSession(db: SqlExecutor, input: PlanInput): Promise<Session> {
  const id = input.id ?? crypto.randomUUID();
  const date = new Date().toISOString();
  let orderIndex = 0;

  await db.transaction(async (tx) => {
    // Append to the end of the Course's sequence, computed inside the txn so concurrent plans can't
    // collide on a position (R5). COALESCE handles the Course's first session (MAX over 0 rows).
    const maxRows = await tx.select<{ max_idx: number | null }>(
      "SELECT MAX(order_index) AS max_idx FROM sessions WHERE course_id = ?",
      [input.courseId],
    );
    orderIndex = (maxRows[0]?.max_idx ?? -1) + 1;

    await insert(tx, "sessions", {
      id,
      course_id: input.courseId,
      project_id: input.projectId ?? null,
      date,
      objective: input.objective,
      minutes: 0,
      did_retrieval: 0,
      writeup_path: null,
      status: "planned",
      completed_at: null,
      milestone_id: input.milestoneId ?? null,
      order_index: orderIndex,
    });

    // Planning a session against a Project "touches" it → open becomes in-progress (FR-009/FR-010).
    // Idempotent + scoped to 'open', so an in-progress/closed Project is untouched. Inline (not a
    // cross-repo call) to keep it inside this transaction.
    if (input.projectId) {
      await tx.execute("UPDATE projects SET status = 'in-progress' WHERE id = ? AND status = 'open'", [
        input.projectId,
      ]);
    }

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

  return SessionSchema.parse({
    id,
    course_id: input.courseId,
    project_id: input.projectId ?? null,
    date,
    objective: input.objective,
    minutes: 0,
    did_retrieval: 0,
    writeup_path: null,
    status: "planned",
    completed_at: null,
    milestone_id: input.milestoneId ?? null,
    order_index: orderIndex,
  });
}

/** A Project's sessions (work blocks), newest first — the "touched" signal for status display. */
export function listSessionsForProject(db: SqlExecutor, projectId: string): Promise<Session[]> {
  return selectParsed(
    db,
    SessionSchema,
    "SELECT * FROM sessions WHERE project_id = ? ORDER BY date DESC",
    [projectId],
  );
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

/** Count of the active vault's **planned** sessions — the Feature-014 reminder "pending work"
 *  signal (vault-scoped transitively via `course → domain`). */
export async function countPlannedSessions(db: SqlExecutor, vaultId: string): Promise<number> {
  const rows = await db.select<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sessions s ${VAULT_JOIN} WHERE d.vault_id = ? AND s.status = 'planned'`,
    [vaultId],
  );
  return rows[0]?.n ?? 0;
}

/** Whether the active vault has a session **completed** on `dayPrefix` (`YYYY-MM-DD`) — the
 *  Feature-014 "practiced today" suppression signal (vault-scoped via `course → domain`). */
export async function hasSessionCompletedOnDay(
  db: SqlExecutor,
  vaultId: string,
  dayPrefix: string,
): Promise<boolean> {
  const rows = await db.select<{ n: number }>(
    `SELECT EXISTS(
       SELECT 1 FROM sessions s ${VAULT_JOIN}
       WHERE d.vault_id = ? AND s.status = 'completed' AND substr(s.completed_at, 1, 10) = ?
     ) AS n`,
    [vaultId, dayPrefix],
  );
  return (rows[0]?.n ?? 0) === 1;
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

/**
 * ALL of a Course's sessions (planned + completed) in curriculum order (Feature 013, R2/R6). The
 * `(order_index, date, id)` sort is deterministic even when rows share `order_index` (pre-feature
 * back-fill or a transient tie — FR-004), so the curriculum always renders stably.
 */
export function listCourseSessions(db: SqlExecutor, courseId: string): Promise<Session[]> {
  return selectParsed(
    db,
    SessionSchema,
    "SELECT * FROM sessions WHERE course_id = ? ORDER BY order_index, date, id",
    [courseId],
  );
}

/**
 * Rewrite the Course's sequence so `order_index` matches each id's position in `orderedIds`
 * (0-based), in one transaction (Feature 013, R2/FR-004). Rewriting the whole course makes
 * duplicate positions impossible by construction; the UI passes the full current ordering with the
 * moved item shifted by one (a move ↑/↓). Each UPDATE is scoped to `course_id`, so ids not
 * belonging to the Course are no-ops. Idempotent.
 */
export async function reorderCourseSessions(
  db: SqlExecutor,
  courseId: string,
  orderedIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let position = 0; position < orderedIds.length; position++) {
      await tx.execute("UPDATE sessions SET order_index = ? WHERE id = ? AND course_id = ?", [
        position,
        orderedIds[position],
        courseId,
      ]);
    }
  });
}

/** Set or clear (null) a session's Milestone association (Feature 013, FR-006/FR-007). Same-course
 *  membership is enforced by the UI/hook (FR-010); the FK only guarantees a valid milestone id. */
export async function setSessionMilestone(
  db: SqlExecutor,
  sessionId: string,
  milestoneId: string | null,
): Promise<void> {
  await update(db, "sessions", { milestone_id: milestoneId }, { id: sessionId });
}

/** Returns the first session (ordered by order_index) within a Course/Milestone that is still
 *  planned (not yet completed) — the "next unlocked" session for sequential gating. Returns null
 *  when all sessions are done. When `milestoneId` is provided, scoped to that milestone; otherwise
 *  scoped to the entire course. */
export async function getNextUnlockedSession(
  db: SqlExecutor,
  courseId: string,
  milestoneId: string | null,
): Promise<Session | null> {
  const rows = await selectParsed(
    db,
    SessionSchema,
    milestoneId
      ? "SELECT * FROM sessions WHERE course_id = ? AND milestone_id = ? AND status = 'planned' ORDER BY order_index, date, id LIMIT 1"
      : "SELECT * FROM sessions WHERE course_id = ? AND status = 'planned' ORDER BY order_index, date, id LIMIT 1",
    milestoneId ? [courseId, milestoneId] : [courseId],
  );
  return rows[0] ?? null;
}
