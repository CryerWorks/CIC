# Contract — Session ordering & milestone mapping (`src/db/repositories/sessions.ts`)

Additive changes to the Feature 012 session repo. Pure data access behind the `src/db` barrel (Constitution IV). All functions take a `SqlExecutor`; rows parse through `SessionSchema` (now including `milestone_id` + `order_index`).

## Changed: `planSession(db, input: PlanInput): Promise<Session>`

`PlanInput` gains an optional `milestoneId`:

```ts
interface PlanInput {
  id?: string;
  courseId: string;
  objective: string;
  milestoneId?: string | null;        // NEW — the Milestone this session advances (optional)
  assignments: AssignmentInput[];
  pretestQuestions: string[];
  cardDrafts: CardDraftInput[];
}
```

- Computes `order_index = COALESCE(MAX(order_index), -1) + 1` over the Course's existing sessions (append to end — FR-003) inside the same transaction as the insert.
- Writes `milestone_id` (default null) onto the row.
- All other behavior unchanged (planned status, children, no vault write, no cards).

## New: `listCourseSessions(db, courseId): Promise<Session[]>`

- `SELECT * FROM sessions WHERE course_id = ? ORDER BY order_index, date, id` — **all** of a Course's sessions (planned + completed) in sequence (R2/R6).
- The `(order_index, date, id)` sort guarantees a deterministic order even when rows share `order_index` (pre-feature back-fill / transient tie — FR-004).

## New: `reorderCourseSessions(db, courseId, orderedIds: string[]): Promise<void>`

- In one transaction, set `order_index = <position>` for each id in `orderedIds` (0-based), scoped to `course_id`.
- **Invariant (FR-004)**: after the call, the Course's sessions hold a contiguous `0..N-1` with no duplicates. Callers pass the full current ordering with the moved item shifted by one (a move ↑/↓); ids not belonging to the Course are ignored.
- Idempotent: re-applying the same `orderedIds` is a no-op-equivalent rewrite.

## New: `setSessionMilestone(db, sessionId, milestoneId: string | null): Promise<void>`

- `UPDATE sessions SET milestone_id = ? WHERE id = ?` — sets or clears (null) the association (FR-006/FR-007).
- Does **not** validate same-course membership at the DB layer (the FK only guarantees a valid milestone id); the **UI/hook restricts choices** to the Course's Milestones (FR-010).

## Unchanged (Feature 012)

`finalizeSession`, `listPlannedSessions`, `listSessionsByVault`, `listPlannedSessionsByCourse`, `getSession`, `listSessionAssignments`, `listPretestResponses`, `listSessionCardDrafts`, `deletePlannedSession` — all retained as-is. `deletePlannedSession` still deletes planned sessions only.

## Invariants & non-goals

- **`milestone_id` is `ON DELETE SET NULL`** — deleting a Milestone unmaps its sessions, never deletes them (FR-008). No repo code needed; the FK enforces it.
- **No vault writes, no card creation** in any function here (FR-013).
- **No new tables** — coverage/progress are derived in the hook (R4), not persisted.
- Vault scoping stays transitive via `course → domain.vault_id`; these functions are Course-scoped and inherit it.
