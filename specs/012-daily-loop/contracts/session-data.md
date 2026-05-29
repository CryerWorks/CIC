# Contract — Session data layer (`src/db/repositories/sessions.ts`)

Two-phase repository. Pure data access behind the `src/db` barrel (Constitution IV). All functions take a `SqlExecutor`; rows are parsed through their zod models on read.

## Types

```ts
type AssignmentKind = "read" | "watch" | "listen" | "review";

interface AssignmentInput { resourceId: string; locator: string | null; kind: AssignmentKind; }
interface CardDraftInput  { front: string; back: string; }          // staged at plan time
interface PretestAnswer   { id: string; userResponse: string | null; revealedAfter?: boolean; }
interface CardCompletion  { front: string; back: string; }          // completed at finish

interface PlanInput {
  id?: string;                 // optional caller-minted id (so the writeup short-id is known up front)
  courseId: string;
  objective: string;
  assignments: AssignmentInput[];
  pretestQuestions: string[];  // questions only — answers come at finish
  cardDrafts: CardDraftInput[];
}

interface FinalizeInput {
  sessionId: string;           // the planned session being done (R12 — update, not insert)
  minutes: number;
  didRetrieval: boolean;
  writeupPath: string | null;
  pretestAnswers: PretestAnswer[];
  cards: CardCompletion[];     // the completed prompts to materialize as new cards
}

interface SessionListItem { session: Session; courseTitle: string; }
```

`card_resources` PK is `(card_id, resource_id)` — one locator per resource per card. Two assignments may point at the **same** resource (different locators), so citation inheritance MUST be deduped by `resourceId` before insert (first occurrence wins) to avoid a PK collision (finding D1).

## Functions

### `planSession(db, input: PlanInput): Promise<Session>`
- Inserts one `sessions` row with `status='planned'` (`id` = uuid or `input.id`, `date` = ISO now, `project_id` = null, `minutes` = 0, `did_retrieval` = 0, `writeup_path` = null, `completed_at` = null), then its `session_assignments`, its `pretest_responses` (`question` set, `user_response` null), and its `session_card_drafts` (`order_index` by position; `back` may be empty).
- **Invariant**: writes **nothing** to the vault and creates **no** `cards` (FR-006). Returns the created planned `Session`.
- Runs inside `db.transaction`.

### `finalizeSession(db, input: FinalizeInput): Promise<Session>`
- `UPDATE sessions SET status='completed', minutes, did_retrieval, writeup_path, completed_at=now WHERE id = sessionId` (R12).
- `UPDATE pretest_responses SET user_response, revealed_after` for each `pretestAnswers` entry (by id).
- Reads the session's `session_assignments`; for each `cards` entry: `createCard` (course = the session's `course_id`, `note_path` when present) then `addCardResource` per assignment **deduped by `resource_id`** (first locator wins).
- `DELETE FROM session_card_drafts WHERE session_id = sessionId` (materialized — R5).
- **Invariants**: created cards have `fsrs_state = null` (new — FR-022, Constitution III); citation rows mirror the session's assignments deduped by resource (FR-021/SC-005); pretest responses are never scored.
- Runs inside `db.transaction` (truly atomic on the node adapter; best-effort on the pooled production adapter). Returns the updated `Session`.

### `listPlannedSessions(db, vaultId, opts?: { limit?: number }): Promise<SessionListItem[]>`
- `sessions JOIN courses JOIN domains WHERE domains.vault_id = ? AND sessions.status='planned'`, ordered by `date` DESC.
- **Invariant (SC-008)**: only the active vault's planned sessions.

### `listPlannedSessionsByCourse(db, courseId): Promise<Session[]>`
- A Course's planned sessions (for the Course-detail "Sessions" section), newest first.

### `listSessionsByVault(db, vaultId, opts?: { limit?: number; status?: "planned" | "completed" }): Promise<SessionListItem[]>`
- The vault's sessions; `status` filters (the Daily Loop "recent" list passes `completed`), ordered by `completed_at` (completed) / `date` DESC.

### `listSessionAssignments(db, sessionId): Promise<SessionAssignment[]>`
### `listPretestResponses(db, sessionId): Promise<PretestResponse[]>`
### `listSessionCardDrafts(db, sessionId): Promise<SessionCardDraft[]>` — ordered by `order_index`.
### `getSession(db, sessionId): Promise<Session | null>`
### `deletePlannedSession(db, sessionId): Promise<void>` — `DELETE FROM sessions WHERE id = ? AND status='planned'` (cascade removes assignments/pretest/drafts; never deletes a completed session — FR-007).

## Invariants & non-goals

- **Never grades** pretest responses — there is no "correct" column or scoring (FR-023).
- **No `milestone_id`** write (R4); `status` is only ever `planned` or `completed`.
- Deleting a Course cascades to its sessions → assignments/pretest/card-drafts (existing + new FKs); deleting a Resource cascades to `session_assignments` — a writeup already in the vault is unaffected.
- Reuses `createCard` / `addCardResource` (Feature 010) — this repo does **not** re-implement card insertion.
