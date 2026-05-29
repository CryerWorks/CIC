# Tasks: Course Session Planner

**Input**: Design documents from `specs/013-course-session-planner/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: INCLUDED. The project conventions (`CLAUDE.md`) require unit tests for data-integrity/core logic (migrations, repos, derivations), and both contracts (`session-ordering.md`, `ui-curriculum.md`) specify Testability. Repo/migration behavior is node-adapter tested; the curriculum view and the Daily Loop are jsdom + `renderApp` tested.

**Organization**: Tasks grouped by user story (US1 sequencing P1 → US2 milestone mapping/coverage P2 → US3 progress P3), behind a blocking Foundational phase (the `m0007` migration + model + version pins).

**Post-analyze**: This file folds in the `/speckit-analyze` remediations — C1 (milestone-delete UI refresh), G1 (Daily Loop guide-not-gate automated test, new T008), G2 (picker-limited test), G3 (no-vault-write/no-card repo assertion), A1 (assignment-summary truncation), I1 (verify live table count).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup/Foundational/Polish carry no story label)
- Exact file paths included

⚠️ **Shared-file reality**: `src/db/repositories/sessions.ts`, `src/features/courses/useCoursePlans.ts`, and `src/features/courses/CourseDetailRoute.tsx` are each touched by multiple stories. Edits to the *same* file across stories are **sequential** (no `[P]`). Inter-story parallelism is therefore limited — the stories are independently *testable*, not independently *file-isolated*.

---

## Phase 1: Setup

**Purpose**: Confirm the working baseline before touching the data layer. No scaffolding — this feature extends the existing `src/db` spine and the Feature 012 Course-detail surfaces.

- [X] T001 Confirm on branch `013-course-session-planner` and the baseline is green: run `npm test`, `npx tsc --noEmit`, `npm run lint` and note the current passing test count (the 013 work must keep it green). Exclude `src-tauri/Cargo.lock` + `Cargo.toml` from any later staging (prior tauri-dev regen).

**Checkpoint**: Baseline green; ready to add the migration.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema + model that EVERY user story depends on. `milestone_id` and `order_index` must exist on `sessions` and round-trip through `SessionSchema` before any repo/UI work.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T002 Create `src/db/migrations/m0007_session_curriculum.ts` (version `7`, name `m0007_session_curriculum`) with statements: `ALTER TABLE sessions ADD COLUMN milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL;`, `ALTER TABLE sessions ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;`, `CREATE INDEX IF NOT EXISTS idx_sessions_milestone_id ON sessions(milestone_id);` — follow the `m0006_session_lifecycle.ts` shape (per data-model.md §Migration). The `ON DELETE SET NULL` action is enforced at runtime (FK enforcement is ON in both adapters — node sets `PRAGMA foreign_keys=ON`, sqlx defaults ON; canary at `src/db/integrity.fk.test.ts`), matching the 011 `resources.domain_id` precedent. ADD COLUMN idempotency/self-heal is already handled by the `migrate.ts` runner (the m0006 fix) — no new guard needed.
- [X] T003 Register `m0007SessionCurriculum` in `src/db/migrations/index.ts` (append after `m0006SessionLifecycle`, preserving order).
- [X] T004 [P] Extend `SessionSchema` in `src/db/models/session.ts`: add `milestone_id: z.string().nullable()` and `order_index: z.number().int()` (per data-model.md §Model). Confirm `test-fixtures.ts` session inserts still satisfy the schema (defaults: `order_index=0`, `milestone_id` null).
- [X] T005 Bump version-pinned migration tests 6 → 7 (data-model.md §Migration): `src/db/migrate.test.ts` (0 → 7, applied 7, `user_version` 7, **table count unchanged** — m0007 adds only columns + an index; **I1: read the actual asserted count from the test (currently `20` at v6 — `migrate.test.ts:30`) and keep it, don't blindly hardcode**), `src/db/migrate.evolution.test.ts` (`first.applied` 7; second `{from:7,to:7,applied:0}`; probe `version: 8`), `src/db/migrate.lossless.test.ts` (probe `version: 8`). Then grep the suite for any remaining stale `toBe(6)` / `version: 6` / `to: 6` assertions (e.g. `src/db/repositories/settings.test.ts` was bumped to 6 in 012) and update to 7.

**Checkpoint**: `npm test` green; `sessions` has both columns; schema round-trips. User stories can begin.

---

## Phase 3: User Story 1 — Sequence a Course's sessions start-to-finish (Priority: P1) 🎯 MVP

**Goal**: A Course's sessions carry an explicit, persisted order shown as a 1..N sequence; the learner reorders with Move ↑/↓; new sessions append to the end. The order is a **guide, not a gate** — the Daily Loop is unaffected.

**Independent Test**: On a Course with three planned sessions, observe the 1..N order, Move one ↑ and one ↓, reload, and confirm the new order persisted (re-query `listCourseSessions`).

### Tests for User Story 1 (write first, ensure they FAIL)

- [X] T006 [P] [US1] Repo tests in `src/db/repositories/sessions.test.ts` (node adapter): `planSession` appends `order_index` = `MAX+1` per Course (first session → 0); `listCourseSessions(courseId)` returns ALL of a Course's sessions ordered by `(order_index, date, id)` incl. the pre-feature tie case (two rows at `order_index=0` sort by `date,id` deterministically); `reorderCourseSessions(courseId, orderedIds)` rewrites to a contiguous `0..N-1` (no duplicate positions), is idempotent, and ignores ids not in the Course (per contracts/session-ordering.md).
- [X] T007 [P] [US1] Component tests in `src/features/courses/CourseDetailRoute.test.tsx` (`renderApp`, seeded node DB on `/courses/:courseId`): plan/seed 3 sessions → assert they render as an ordered list numbered 1..3; click Move ↑ on row 3 → assert new order and that re-querying `listCourseSessions` persists it; assert Move ↑ disabled on the first row and Move ↓ on the last.
- [X] T008 [P] [US1] **(G1 — guide-not-gate)** Test in `src/features/loop/LoopRoute.test.tsx`: seed a Course with multiple planned sessions whose `order_index` is non-sequential / reverse of creation order → assert the Daily Loop lists **all** of them and **any** can be started, with listing/startability **independent of `order_index`** (the loop must not sort by, gate on, or hide by sequence — FR-005/SC-004, Constitution III). This locks the guarantee that doing T013/T020 to the curriculum view never leaks ordering into the "do" surface.

### Implementation for User Story 1

- [X] T009 [US1] In `src/db/repositories/sessions.ts`, extend `planSession` to compute `order_index = COALESCE(MAX(order_index), -1) + 1` over the Course's existing sessions **inside the same transaction** as the insert (append-to-end — FR-003/R5). Other planning behavior unchanged.
- [X] T010 [US1] Add `listCourseSessions(db, courseId): Promise<Session[]>` to `src/db/repositories/sessions.ts` — `SELECT * FROM sessions WHERE course_id = ? ORDER BY order_index, date, id` (all planned + completed; parse through `SessionSchema`).
- [X] T011 [US1] Add `reorderCourseSessions(db, courseId, orderedIds: string[]): Promise<void>` to `src/db/repositories/sessions.ts` — in one transaction set `order_index = <position>` (0-based) for each id, scoped to `course_id`; ids outside the Course ignored (invariant: contiguous `0..N-1`, no duplicates — FR-004/R2).
- [X] T012 [US1] In `src/features/courses/useCoursePlans.ts`, load the Course's sessions via `listCourseSessions` (ordered) and expose `sessions: Session[]` + `reorder(orderedIds)` → `reorderCourseSessions` then refresh. The view computes the swapped array for a move ↑/↓ (per contracts/ui-curriculum.md).
- [X] T013 [US1] In `src/features/courses/CourseDetailRoute.tsx`, grow the `CourseSessions` section into the ordered curriculum: render an `<ol>`/list-semantics sequence numbered 1..N (position, objective, **a truncated one-line assignment summary — A1: cap at a fixed length, e.g. first assignment + "+N more", no multiline**, status badge); add **Move ↑ / Move ↓** `<button>`s on planned rows with `aria-label="Move up/down: <objective>"`, disabled at the ends and for a single session (no-op). Do **not** introduce any ordering into the Daily Loop (guarded by T008). Obsidian tokens (charcoal + purple, **no cyan**). Empty state = onboarding prompt to plan a session.

**Checkpoint**: US1 fully functional — order is set, reordered, persisted, and shown; the loop stays order-blind; MVP deliverable.

---

## Phase 4: User Story 2 — Map sessions to Milestones and see coverage (Priority: P2)

**Goal**: Each planned session can be tagged with one Milestone of its Course (or left unassigned); a coverage strip shows sessions-per-Milestone, flags uncovered Milestones, and counts the unassigned bucket. Deleting a Milestone unmaps (never deletes) its sessions, and the curriculum reflects that **without a manual reload**.

**Independent Test**: On a Course with 2 Milestones and 3 sessions, assign 2 to Milestone A and leave 1 unassigned → coverage shows A=2, B uncovered (0), unassigned=1; persists across reload. Delete Milestone A → its sessions show unassigned, none lost, coverage updates live.

### Tests for User Story 2 (write first, ensure they FAIL)

- [X] T014 [P] [US2] Repo tests in `src/db/repositories/sessions.test.ts` (node adapter): `setSessionMilestone(sessionId, milestoneId)` sets and `(…, null)` clears; `planSession` accepts an optional `milestoneId` written onto the row (default null); deleting a `milestones` row that a session points at sets that session's `milestone_id` to NULL and **does not delete the session** (`ON DELETE SET NULL` — FR-008/R3). **(G3)** Also assert these three functions (`planSession`, `reorderCourseSessions`, `setSessionMilestone`) perform **no vault write and create no card** — e.g. they don't touch `VaultWriter`/`createCard`; a spied/stub VaultWriter receives zero calls and the `cards` table count is unchanged (FR-013/SC-005).
- [X] T015 [P] [US2] Component tests in `src/features/courses/CourseDetailRoute.test.tsx`: assign a Milestone via the per-row select → assert it shows and persists (re-query); assert the coverage strip shows correct per-Milestone counts, a 0-count Milestone flagged uncovered, and an unassigned count. **(G2)** Assert the per-row Milestone select offers **only this Course's Milestones** (seed a second Course with its own Milestone and confirm it is absent from the options — FR-010). **(C1)** Drive milestone deletion through the **actual in-app path** the user uses on the Course-detail screen (the MilestonesEditor/course-edit action), not a bare data-layer delete + manual refetch → assert the affected session row flips to "unassigned" **and the coverage strip updates without a manual reload** (quickstart §E).

### Implementation for User Story 2

- [X] T016 [US2] Add `setSessionMilestone(db, sessionId, milestoneId: string | null): Promise<void>` to `src/db/repositories/sessions.ts` — `UPDATE sessions SET milestone_id = ? WHERE id = ?` (no same-course check at the DB layer; the UI restricts choices — per contracts/session-ordering.md).
- [X] T017 [US2] Extend `planSession` in `src/db/repositories/sessions.ts` to accept an optional `milestoneId` on `PlanInput` and write it onto the row (default null). (Same file as T009 — sequential.)
- [X] T018 [US2] In `src/features/courses/useCoursePlans.ts`, also load `listMilestonesByCourse(courseId)`; expose `milestones`, a derived `coverage` (`{ milestone, count }[]` + `unassignedCount`, count 0 ⇒ uncovered — R4/FR-009), `setMilestone(sessionId, milestoneId|null)` → `setSessionMilestone` then refresh, and pass `milestoneId` through `plan(input)`. **(C1)** Make the hook re-load **both** milestones and sessions on (re)entry, and expose a `refresh()` the view can call after an external milestone edit so coverage never goes stale. (Same file as T012 — sequential.)
- [X] T019 [US2] In `src/features/courses/SessionPlanner.tsx`, add an optional **Milestone picker** (limited to the Course's Milestones, with an "— none —" option) so a new session can be tagged on creation; saving passes `milestoneId` through `plan`.
- [X] T020 [US2] In `src/features/courses/CourseDetailRoute.tsx`, add to each planned row a **Milestone `<select>`** (Course's Milestones + "— none —", associated label) and render a **coverage strip** (each Milestone with its count; uncovered Milestones visibly flagged; an "unassigned" count). Completed rows show their Milestone (or "unassigned") read-only. **(C1)** If the MilestonesEditor / course-edit action is reachable from this screen, wire its save/delete to call the hook's `refresh()` so a milestone deletion updates the rows + coverage in place (no reload). (Same file as T013 — sequential.)

**Checkpoint**: US1 + US2 both work — sessions are ordered AND milestone-mapped with live coverage; milestone deletion is non-destructive and reflected immediately.

---

## Phase 5: User Story 3 — Track progress through the curriculum (Priority: P3)

**Goal**: Completed sessions are visually distinct, keep their sequence position, and the Course shows a plain done/total progress count — no "mastered"/"learned" wording.

**Independent Test**: On a Course with sessions where some are `status='completed'` (seed), assert completed rows render read-only "done" in their original positions and the Course shows progress `done / total` as a literal count.

### Tests for User Story 3 (write first, ensure they FAIL)

- [X] T021 [P] [US3] Component tests in `src/features/courses/CourseDetailRoute.test.tsx`: seed a Course with mixed `planned`/`completed` sessions → assert completed rows show a "done" badge, render read-only (no Move/select/Delete controls), and keep their order position; assert the progress indicator reads `done / total` with no "mastered"/"learned" text.

### Implementation for User Story 3

- [X] T022 [US3] In `src/features/courses/useCoursePlans.ts`, derive `progress: { done: number; total: number }` from the loaded sessions (`done = count(status==='completed')`, `total = count`) — R4/FR-012. (Same file as T012/T018 — sequential.)
- [X] T023 [US3] In `src/features/courses/CourseDetailRoute.tsx`, render completed rows read-only as "done" (keep position; no controls — R6) and add a **progress** indication (`done / total`, a literal count — **no "mastered"/"learned" language**, Constitution III). (Same file as T013/T020 — sequential.)

**Checkpoint**: All three stories functional — the Course-detail "Sessions" section is the ordered, milestone-aware curriculum with coverage and progress.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 [P] Reconcile `PRD-CIC-Platform.md`: §8 `sessions` gains `milestone_id` (FK SET NULL) + `order_index`; note `m0007` (schema 6 → 7); resolve the deferred §8 `sessions.milestone_id` flag from 010/012; bump the version + add a changelog entry.
- [X] T025 Full quality gate (must be green before walkthrough): `npx tsc --noEmit`, `npm run lint` (incl. the vendor/adapter import restrictions), `npm test`, `npm run build`. No Rust touched. Clean up any stray/unused symbols.
- [X] T026 Update the `<!-- SPECKIT … -->` block + Current focus in `CLAUDE.md` to mark 013 **implemented** (demote 012 to prior), summarizing what shipped.
- [ ] T027 Live `tauri dev` walkthrough of `quickstart.md` A–I (user-run): plan 3 sessions → sequence (move ↑, persist) → map Milestones + coverage → Milestone deletion unmaps (live) → Daily Loop does any session in any order → complete one → progress 1/3 → confirm **no** vault files / **no** cards from planning → per-vault isolation. This is the human end-to-end check (the user runs it). The mandatory end-of-feature **walkthrough** (Constitution V, workflow step 8) is delivered after this gate passes.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → no deps.
- **Foundational (T002–T005)** → after Setup; **BLOCKS all user stories** (schema + model + version pins must land first).
- **US1 (T006–T013)** → after Foundational. The MVP. T008 (loop guide-not-gate) is independent of the curriculum tasks (different file) and can be written any time after Foundational.
- **US2 (T014–T020)** → after Foundational. Builds on US1's curriculum row UI but is independently testable; its `sessions.ts`/`useCoursePlans.ts`/`CourseDetailRoute.tsx` edits are **sequential after** the US1 edits to those same files.
- **US3 (T021–T023)** → after Foundational. Layers progress onto the same hook + view; sequential after US1/US2 edits to those files.
- **Polish (T024–T027)** → after all desired stories.

### Within each story

- Write the story's test tasks first and confirm they FAIL, then implement.
- Repo functions (sessions.ts) before the hook (useCoursePlans.ts) before the view (CourseDetailRoute.tsx).

### Parallel opportunities

- **T004** [P] (model) runs alongside **T002/T003** (migration files) — different files. **T005** waits on T002/T003.
- Within a story, the test tasks touch **different files** and are [P] with each other (e.g. T006 repo + T007 component + T008 loop), but precede that story's implementation.
- **Cross-story implementation is largely sequential** — US1/US2/US3 all edit `sessions.ts`, `useCoursePlans.ts`, and `CourseDetailRoute.tsx`. Do not parallelize edits to the same file.
- **T024** [P] (PRD doc) is independent of the code gate.

### Parallel example (Foundational)

```text
# T002 (create m0007 migration) and T004 (extend SessionSchema) are different files → parallel.
# T003 (register in index.ts) waits on T002; T005 (version-pin tests) waits on T002+T003.
```

### Parallel example (User Story 1 tests)

```text
Task: "T006 Repo tests for ordering/reorder in src/db/repositories/sessions.test.ts"
Task: "T007 Component tests for sequence + move in src/features/courses/CourseDetailRoute.test.tsx"
Task: "T008 Loop guide-not-gate test in src/features/loop/LoopRoute.test.tsx"
# Three different files, all written before T009–T013 implementation.
```

---

## Implementation Strategy

### MVP first (US1 only)

1. T001 Setup → 2. T002–T005 Foundational → 3. T006–T013 US1 → **STOP & VALIDATE** (sequence + reorder + persist; loop stays order-blind). Shippable: a Course reads as an ordered curriculum.

### Incremental delivery

- + US2 (T014–T020): milestone mapping + coverage + non-destructive, live-refreshing milestone delete.
- + US3 (T021–T023): progress + completed-session rendering.
- Polish (T024–T027): PRD reconcile, full gate, CLAUDE.md, live quickstart + walkthrough.

### Guardrails to honor throughout

- **No vault writes, no card creation** anywhere in this feature (FR-013/SC-005) — asserted by T014 (G3); planning/sequencing/mapping are SQLite-only.
- **Order is a guide, not a gate** (FR-005/SC-004) — never disable/hide/lock a session; the Daily Loop is untouched and asserted order-blind by T008.
- **No mastery state** — progress is a literal `done/total` count (Constitution III).
- **No AI**, no vendor SDKs; `tauri-plugin-sql` only via `src/db/adapters`.

---

## Notes

- 27 tasks (T001–T027). Per-story: US1 = 8 (3 test + 5 impl), US2 = 7 (2 test + 5 impl), US3 = 3 (1 test + 2 impl); Foundational = 4; Setup = 1; Polish = 4.
- The `ON DELETE SET NULL` + ordering-normalization + no-vault-write invariants are node-adapter tested (T006/T014); the curriculum view (sequence/move/assign/coverage/progress, picker-limited, live milestone-delete refresh) is component-tested (T007/T015/T021); the loop's order-blindness is tested in T008.
- Commit after each logical group; stage specific files only (never `git add -A`); **exclude `src-tauri/Cargo.lock` + `Cargo.toml`**; add the `Co-Authored-By: Claude Opus 4.7` trailer. Hold the commit until the user authorizes (per the 012 pattern).
- The `after_tasks` git.commit hook is **optional** and not auto-run (`auto_execute_hooks: false`).
