# Contract — Course curriculum view (`src/features/courses/`)

The Feature 012 Course-detail "Sessions" section grows into the ordered, milestone-aware curriculum. State lives in `useCoursePlans(courseId)` (extended); the view is `CourseSessions` inside `CourseDetailRoute`.

## `useCoursePlans(courseId)` — extended

Loads (active vault): the Course's **all** sessions via `listCourseSessions` (ordered), its Milestones (`listMilestonesByCourse`), and the active-vault Resources (`listResources`). Exposes:

- `sessions: Session[]` — the ordered curriculum (planned + completed).
- `milestones: Milestone[]`, `resources: Resource[]`.
- `coverage` — derived: `{ milestone: Milestone; count: number }[]` + an `unassignedCount`. A milestone with `count === 0` is uncovered (R4/FR-009).
- `progress` — derived: `{ done: number; total: number }` (FR-012).
- `plan(input)` — `planSession` (now passes `milestoneId` when chosen at plan time).
- `removePlan(id)` — `deletePlannedSession` (planned only).
- `reorder(orderedIds)` — `reorderCourseSessions`; the view computes the new array for a move ↑/↓.
- `setMilestone(sessionId, milestoneId | null)` — `setSessionMilestone`, then refresh.

All mutations refresh the loaded sessions so the view, coverage, and progress stay consistent.

## `CourseSessions` (curriculum view)

A section on `/courses/:courseId`:

- **Ordered list** of the Course's sessions, numbered `1..N` in sequence (FR-001). Each row shows: position, objective, a short assignment summary, the assigned **Milestone** (or "unassigned"), and a **status** badge (`planned` / `done`).
- **Planned** rows carry controls: **Move ↑ / Move ↓** (disabled at the ends; a no-op for a single session — FR-002), a **Milestone select** limited to the Course's Milestones with an "— none —" option (FR-006/FR-007/FR-010), and **Delete** (FR-007 of 012). **Completed** rows render read-only as "done" but keep their position (R6/US3).
- **Plan a session** opens the Feature 012 `SessionPlanner` (now with an optional Milestone picker so a new session can be tagged on creation); saving appends it to the end of the sequence.
- **Coverage strip**: each Milestone with its session count; uncovered Milestones (0 sessions) visibly flagged; an "unassigned" count for sessions with no Milestone (FR-009/SC-003).
- **Progress**: a `done / total` indication for the Course (FR-012/SC-006) — a literal count, **no "mastered"/"learned" language** (Constitution III).
- **Empty state**: with no sessions, an onboarding prompt to plan one (not an error).

## Guardrails (Constitution III, surfaced in UI)

- The sequence is a **guide, not a gate**: it never disables, hides, or locks a session, and the Daily Loop still lists/does any planned session in any order (FR-005/SC-004). No "you must finish session 1 first".
- Nothing here marks a session/card/milestone "learned"; progress is a plain count.
- Planning/reordering/mapping write **nothing** to the vault and create **no** review cards (FR-013/SC-005).

## Accessibility

- Move controls are real `<button>`s with accessible names (e.g., `aria-label="Move up: <objective>"`); the Milestone `<select>` has an associated label; status is text, not color-only.
- The ordered list uses an `<ol>`/list semantics so the sequence is conveyed to assistive tech.
- Obsidian tokens (charcoal + purple; **no cyan** — no AI output here).

## Testability

- Component tests (`renderApp`, seeded node DB) on `/courses/:courseId`: plan 2–3 sessions → assert order; move one ↑/↓ → assert new order persists (re-query `listCourseSessions`); assign a Milestone → assert coverage updates and persists; delete a Milestone (via the data layer) → assert the session shows unassigned; complete a session (seed `status='completed'`) → assert progress `done/total`.
- Repo behavior (ordering normalization, `ON DELETE SET NULL`) is node-adapter tested separately (see session-ordering.md).
