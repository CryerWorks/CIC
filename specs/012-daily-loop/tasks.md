---
description: "Task list for Feature 012 â€” The Daily Loop (two-phase: plan then do)"
---

# Tasks: The Daily Loop (plan a session, then do it)

**Input**: Design documents in `specs/012-daily-loop/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: Included. Constitution V requires Vitest on data-integrity surfaces (migrations, repositories, vault writes); the migration, the plan/finalize repo paths, the writeup builder, and both UI flows are tested.

**Organization**: By user story (US1/US2 P1 â†’ US5 P3). The migration + data layer is foundational; each story is an independently testable increment.

## Path Conventions

Single project. Source under `src/`; tests co-located `*.test.ts(x)`. Repo/migration tests use the node `SqlExecutor` adapter; component tests use `renderApp` (jsdom).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Route + nav: `<Route path="loop" element={<LoopRoute />} />` in `src/app/router.tsx`; `{ path: "/loop", label: "Daily Loop", implemented: true }` in `src/app/navigation.ts`. (Already present from the first cut.)

---

## Phase 2: Foundational (migration + data layer â€” BLOCKS all stories)

**âš ï¸ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T002 Migration `src/db/migrations/m0006_session_lifecycle.ts` â€” `ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed'))`, `ALTER TABLE sessions ADD COLUMN completed_at TEXT`, and `CREATE TABLE session_card_drafts (...)` + index (per data-model.md). Register it in `src/db/migrations/index.ts`.
- [X] T003 [P] Update version-pinned migration tests: `src/db/migrate.test.ts` (0 â†’ 6, applied 6, `user_version` 6, **20 tables**), `src/db/migrate.evolution.test.ts` (`first.applied` 6; second `{from:6,to:6,applied:0}`; probe comments), `src/db/migrate.lossless.test.ts` (probe `version: 7`). (depends on T002)
- [X] T004 Models: add `status` + `completed_at` to `SessionSchema` in `src/db/models/session.ts`; add `src/db/models/sessionCardDraft.ts` (`SessionCardDraft`) and export from `src/db/models/index.ts`.
- [X] T005 Repository `src/db/repositories/sessions.ts` â€” rewrite for two-phase: `planSession` (insert `planned` + assignments + pretest questions + card drafts), `finalizeSession` (UPDATE â†’ `completed`, fill pretest answers, materialize drafts â†’ `createCard`/`addCardResource` deduped by resource, delete drafts), `listPlannedSessions`, `listPlannedSessionsByCourse`, `listSessionsByVault` (with `status` filter), `listSessionCardDrafts`, `deletePlannedSession`, keep `getSession`/`listSessionAssignments`/`listPretestResponses` (per contracts/session-data.md). Export new fns + the model from `src/db/index.ts`. (depends on T004)
- [X] T006 [P] Node-adapter tests `src/db/repositories/sessions.test.ts` â€” `planSession` persists a `planned` row + children and writes no cards/vault; `finalizeSession` flips to `completed`, fills pretest answers, materializes drafts as **new** cards (`fsrs_state` null) citing the session's resources **deduped** (two assignments on one resource â†’ one citation, D1), and deletes drafts; `listPlannedSessions`/`listSessionsByVault` scope to the active vault; `deletePlannedSession` cascades and refuses completed sessions. (depends on T005)

**Checkpoint**: Sessions can be planned, listed, and finalized at the data layer.

---

## Phase 3: User Story 1 â€” Plan a session in a Course (Priority: P1) ðŸŽ¯ MVP (with US2)

**Goal**: From a Course, establish a planned session (objective + assignments + pretest questions + card prompts).

**Independent Test**: On a Course, plan a session with an objective, a PDF assignment, two pretest questions, one card prompt; confirm a `planned` session persists with its children and shows in the Course's planned list; deleting it removes it.

- [X] T007 [US1] `src/features/courses/useCoursePlans.ts` â€” `useCoursePlans(courseId)`: load the Course, its planned sessions (`listPlannedSessionsByCourse`), the active-vault Resources (`listResources`) and Milestones (`listMilestonesByCourse`); `plan(input)` â†’ `planSession`; `removePlan(id)` â†’ `deletePlannedSession`; refresh on change.
- [X] T008 [US1] `src/features/courses/SessionPlanner.tsx` â€” sectioned form (Objective + Milestone seed; Assignments rows: Resource/kind/locator; Pretest question rows; Card prompt rows front+back). Save blocked while objective empty; Save â†’ `plan(...)`; Cancel persists nothing (per contracts/ui-loop.md).
- [X] T009 [US1] Wire a **"Sessions"** section into `src/features/courses/CourseDetailRoute.tsx`: the planned-sessions list (objective + date + Delete) and a "Plan a session" toggle rendering `SessionPlanner`. (depends on T007, T008)
- [X] T010 [P] [US1] Component test `src/features/courses/SessionPlanner.test.tsx` (or extend `CourseDetailRoute.test.tsx`): plan a session via the form â†’ it appears in the list and persists as `planned` with assignments/pretest/drafts; empty objective blocks save; Delete removes a plan. (depends on T009)

**Checkpoint**: Sessions can be established on a Course.

---

## Phase 4: User Story 2 â€” Do a planned session and record it (Priority: P1) ðŸŽ¯ MVP

**Goal**: From the Daily Loop, do a planned session through the guided steps â†’ completed + vault writeup.

**Independent Test**: Take a planned session, do it (recall + atomic note), finish; confirm it flips to `completed`, one `type: log` writeup lands in the vault, and the recent-completed list shows it; abandoning leaves it `planned`.

- [X] T011 [P] [US2] Pure writeup builder `src/features/loop/writeup.ts` â€” `buildWriteup(data): NoteInput` (`type: log` frontmatter + body sections, empty sections omitted) and `writeupPath(date, objective, sessionId)` (per contracts/vault-writeup.md). (Largely reusable from the first cut.)
- [X] T012 [P] [US2] Unit tests `src/features/loop/writeup.test.ts`: frontmatter keys; sections present/omitted; collision-free path; idempotent clean Markdown.
- [X] T013 [US2] Rewrite `src/features/loop/useDailyLoop.ts` â€” **load** a planned session by id (objective read-only, assignments, pretest questions, card drafts); hold doing-state (pretest answers, retrievalText, selfTestText, note title/body, card completions); `runFinish()`: compute `writeupPath` â†’ `finalizeSession(sessionId, â€¦)` (DB-first) â†’ write atomic note + writeup via `VaultWriter` with conflict/error handling + `retry()` (R7). (depends on T005, T011)
- [X] T014 [US2] `src/features/loop/Stepper.tsx` â€” ordered steps, Next/Back/Skip, focus-to-heading on transition (reuse/trim from the first cut).
- [X] T015 [P] [US2] Steps `src/features/loop/steps/{RetrievalStep,NoteStep,SelfTestStep,FinishStep}.tsx` â€” retrieval scratchpad starts empty (Constitution III); note title+body (`[[wikilinks]]`); self-test scratchpad (never graded); finish review + `runFinish()`, success links to the writeup, failure shows **retry**. (depends on T013)
- [X] T016 [US2] Rewrite `src/features/loop/LoopRoute.tsx` â€” planned-sessions list (`listPlannedSessions`, **Start**) + recent-completed list (`listSessionsByVault status=completed`, link to writeup); Start loads the session and launches the `Stepper`; empty state links to `/courses`. (depends on T013, T014, T015)
- [X] T017 [US2] Integration test `src/features/loop/LoopRoute.test.tsx` (`renderApp`, seeded planned session, fake vault): do the session end-to-end â†’ `completed` + one writeup; recent list shows it; **abandon mid-flow leaves it `planned`, no writeup**; per-vault scoping; **writeup-failure path** (throwing/`conflict` `VaultWriter`) leaves the session `completed` and surfaces **retry**. (depends on T016)

**Checkpoint**: A planned session can be done end-to-end (MVP complete with US1).

---

## Phase 5: User Story 3 â€” Open the pre-assigned sources (Priority: P2)

**Goal**: Open each planned assignment at its locator during active study.

**Independent Test**: Do a planned session with a PDF assignment at `page=10`; Open â†’ best-effort page 10; a physical-book assignment shows its locator as text; a `mm:ss-mm:ss` video opens at the start.

- [X] T018 [US3] Fix `toSeconds` in `src/features/srs/citations/openTarget.ts` â€” parse the **start** of a range locator (`10:30-15:30` â†’ 630s) instead of the first integer; regression test in `openTarget.test.ts`. (Done.)
- [X] T019 [US3] `src/features/loop/steps/ActiveStudyStep.tsx` â€” list the session's **pre-assigned** resources (read-only) and **Open** each via `openCitation(resourceTarget(resource, locator))` (injected opener); show the locator as text when no target (FR-014). (depends on T013)
- [X] T020 [P] [US3] Tests `src/features/loop/steps/ActiveStudyStep.test.tsx` â€” Open calls the injected opener with the expected `file://â€¦#page=10` target; non-openable kind renders locator text. Extend `LoopRoute.test.tsx` to assert the writeup "Studied" section. (depends on T019)

**Checkpoint**: Doing connects to real study material with best-effort deep-linking.

---

## Phase 6: User Story 4 â€” Planned cards become cited review cards (Priority: P2)

**Goal**: Complete the staged card prompts during doing; on finish they become **new**, cited cards.

**Independent Test**: Do a planned session with a PDF assignment + one staged prompt; complete the card, finish; the card exists citing the PDF at its locator and is **new**.

- [X] T021 [US4] `src/features/loop/steps/MakeCardsStep.tsx` â€” render the staged card drafts; edit front / fill back; MAY add a card; bind to `useDailyLoop` card-completion state. (depends on T013)
- [X] T022 [US4] In `finalizeSession`/`runFinish`, materialize completed cards (created **new**; `note_path` = the atomic note when present) with `card_resources` inherited from the session's assignments **deduped by resource** (D1); render the "Cards made" writeup section. (depends on T021; mostly in T005)
- [X] T023 [P] [US4] Tests: extend `sessions.test.ts` (materialized card is new + cited + deduped) and `LoopRoute.test.tsx` (complete-a-card flow). (depends on T022)

**Checkpoint**: Sessions convert into durable, source-cited retrieval practice.

---

## Phase 7: User Story 5 â€” Prime learning with the planned pretest (Priority: P3)

**Goal**: Attempt the planned pretest questions during doing (ungraded); surface them in the writeup.

**Independent Test**: Plan a session with two pretest questions; do it, attempt them, finish; the attempts appear verbatim in the writeup with no scoring; none planned omits the section.

- [X] T024 [US5] `src/features/loop/steps/PretestStep.tsx` â€” render the planned questions; capture an attempt per question; framed "wrong is expected", no correct/incorrect UI; bind to `useDailyLoop` pretest-answer state. (depends on T013)
- [X] T025 [US5] Persist answers via `finalizeSession` (update `pretest_responses.user_response`) and render the "Pretest â€” what I thought" writeup section (omitted when empty). (depends on T024; mostly in T005)
- [X] T026 [P] [US5] Tests: answers persist ungraded (`sessions.test.ts`); writeup includes attempts; no questions omits the section (`writeup.test.ts`/`LoopRoute.test.tsx`). (depends on T025)

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T027 [P] Accessibility pass per contracts/ui-loop.md (roles/labels, focus-to-heading on step change); confirm `src/app/a11y.test.tsx` passes with the loop + planner.
- [X] T028 Quality gate: `npx tsc --noEmit`, `npx eslint`, `npx vite build`, full `npx vitest run` â€” all green.
- [X] T029 Docs: reconcile PRD (`PRD-CIC-Platform.md` â€” note F2 Phase-2 **two-phase** implementation, the lifecycle/`status` + `session_card_drafts` migration, milestone-seed-only; bump version + changelog) and update the `CLAUDE.md` SPECKIT block.
- [ ] T030 Run `specs/012-daily-loop/quickstart.md` live in `tauri dev` (the user's end-to-end check: plan â†’ do).

---

## Dependencies & Execution Order

- **Setup (T001)**: done.
- **Foundational (T002â€“T006)**: T002 â†’ T003/T004 â†’ T005 â†’ T006. **Blocks all stories.**
- **US1 (T007â€“T010)** and **US2 (T011â€“T017)**: after Foundational. Together = MVP (plan + do). US2's doing flow can be built once the repo exists; US1's planner is independent of US2.
- **US3 (T018â€“T020)**, **US4 (T021â€“T023)**, **US5 (T024â€“T026)**: after US2's hook/stepper. US3/US5 independent of US4.
- **Polish (T027â€“T030)**: after the desired stories.

## Implementation Strategy

1. Migration + data layer (T002â€“T006) â†’ validate with repo tests.
2. MVP: US1 planner (T007â€“T010) + US2 doing flow (T011â€“T017) â†’ plan one, do one, confirm the writeup + abandon-leaves-planned.
3. US3 (open at locator) â†’ US4 (cited cards) â†’ US5 (pretest) â†’ Polish.

## Notes

- [P] = different files, no incomplete-task dependency.
- Migration m0006 (schema 5 â†’ 6) is the only schema change; reuse `createCard`/`addCardResource` for materialization (no re-implementation).
- Constitution III is load-bearing: staged prompts are not cards until completed on finish (then **new**); empty retrieval before reveal; ungraded pretest; nothing auto-marked learned.
- Constitution I: the atomic note + writeup are the only vault writes (finish only) â€” both via `VaultWriter`, never-clobber + retry. Planning writes nothing to the vault.


