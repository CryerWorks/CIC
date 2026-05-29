---
description: "Task list for Feature 010 — Native FSRS Spaced Repetition (SRS)"
---

# Tasks: Native FSRS Spaced Repetition (SRS)

**Input**: Design documents from `specs/010-srs-fsrs/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution §V + the quality gates require Vitest for the data-integrity surfaces (FSRS scheduling, vault writes, repositories). The contracts list explicit obligations; UI gets jsdom component tests. Test task precedes its implementation task within each phase.

**Organization**: By user story (US1 P1 → US2 P2 → US3 P3 → US4 P4) on top of a shared Setup + Foundational phase (the FSRS `Scheduler` engine seam + the core `cards`/`reviews` repositories). The `cards`/`reviews` SQLite schema already exists (003); only US4 needs the additive `m0004` migration, so it lives in US4 — keeping US4 splittable into its own feature if desired.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task → parallelizable
- File paths are exact and relative to the repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the one new runtime dependency and confirm the guardrails before coding.

- [X] T001 Add `ts-fsrs` to `package.json` dependencies and install; confirm it is the **only** new runtime dep and that it will be imported in exactly one file (`src/features/srs/fsrs/scheduler.ts`, research R1 / Constitution IV); confirm `tsconfig`/ESLint already cover the new `src/features/srs/**` and `src/features/resources/**` trees; re-read R4 (new-card cap), R11 (confidence has **no default**), and R9 (US4 ships the only migration) so the work respects all three.

---

## Phase 2: Foundational (Blocking Prerequisites) — FSRS engine + core card/review repos

**Purpose**: The shared engine + data layer every story builds on: the `Scheduler` seam (with `ts-fsrs` quarantined behind it), and the `cards`/`reviews` repositories (CRUD, due-queue, the review transaction). Constitution IV (no scheduler-type leak) and III (a card is "learned" only via a real review) are watch-items here.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T002 [P] Define the engine domain types + state schema: `Grade`/`GradeResult` in `src/features/srs/fsrs/types.ts` and the `SchedulingState` zod schema (+ inferred type) validating `cards.fsrs_state` JSON in `src/features/srs/fsrs/schedulingState.ts` (contracts/scheduler.md, data-model).
- [X] T003 [P] Scheduler unit tests in `src/features/srs/fsrs/scheduler.test.ts`: grade→Rating mapping (again=1…easy=4); due monotonicity `again < hard ≤ good < easy` for the same `prev`+`now` (SC-002); new-card `grade(null,…)` init with no NaN/invalid date; determinism; `GradeResult.state` round-trips through the `SchedulingState` schema; **no `ts-fsrs` type appears outside the impl** (greppable assertion). (scheduler.md guarantees 1–6.)
- [X] T004 Implement `createScheduler()` (`initial`/`grade`/`preview`) wrapping `ts-fsrs` — **the only file importing `ts-fsrs`** — in `src/features/srs/fsrs/scheduler.ts` (depends T002; satisfies T003). **Also add an ESLint `no-restricted-imports` rule that forbids `ts-fsrs` everywhere except `src/features/srs/fsrs/scheduler.ts`** (mirroring the vendor-SDK enforcement) so the seam is mechanically enforced, not convention-only (Constitution IV; C1).
- [X] T005 [P] `cards` repo tests in `src/db/repositories/cards.test.ts` (`// @vitest-environment node`, `node:sqlite`, 009 `attachVault`+`createDomain(db,VID,…)`+`createCourse` seeding): `createCard` → new card (`fsrs_state`/`due_at` NULL); `listCardsByCourse`; `getCard`; `listDueCards` returns due review cards then capped new cards, ordered, **vault-scoped (two-vault isolation)**, respecting the daily cap and the "new introduced today" boundary (R4/R5); `countDueCards`; `updateCardContent` does not touch `fsrs_state`/`due_at` (FR-011); a card with malformed/absent `fsrs_state` is surfaced in the queue as a new card, not dropped (FR-021); Course delete cascades cards **and their reviews + `card_resources`** (FR-024). (srs-data.md.)
- [X] T006 Implement the `cards` repo (`createCard`, `updateCardContent`, `deleteCard`, `getCard`, `listCardsByCourse`, `listDueCards`, `countDueCards`) in `src/db/repositories/cards.ts`; export from `src/db/index.ts` (satisfies T005). *(Note: the `noteBlockId` arg of `updateCardContent` is wired in US4 once the column exists; here it handles front/back/notePath/links.)*
- [X] T007 [P] `reviews` repo tests in `src/db/repositories/reviews.test.ts`: `recordReview` runs in one transaction — loads `fsrs_state`, calls the `Scheduler`, updates the card (`fsrs_state`/`due_at`/`last_reviewed`) and inserts a `reviews` row (rating + confidence + reviewed_at + elapsed_ms); a new card's first review takes the `prev=null` path; the logged `due_at` reflects the grade (monotonic); a card whose stored `fsrs_state` is **malformed/non-conforming JSON is treated as a new card (re-initialized) and reviews without throwing** (FR-021); `listReviewsByCard` returns history. (srs-data.md, R12.)
- [X] T008 Implement the `reviews` repo (`recordReview` via `SqlExecutor.transaction` + the `Scheduler`; `listReviewsByCard`) in `src/db/repositories/reviews.ts`; export from `src/db/index.ts` (depends T004, T006; satisfies T007).

**Checkpoint**: the FSRS engine + `cards`/`reviews` repos exist and are tested; the review transaction works end-to-end at the data layer.

---

## Phase 3: User Story 1 - Review the due queue (Priority: P1) 🎯 MVP

**Goal**: A vault-wide due-queue review session — recall-before-reveal, four grades, confidence (no default), FSRS reschedules, queue empties; the dashboard shows a real due count.

**Independent Test**: Seed cards with varied due dates under a vault; open Review → only due cards appear, the back is hidden until reveal, each grade reschedules sensibly and logs a review, the queue empties to a "caught up" state; switching the active vault re-scopes the queue.

- [X] T009 [P] [US1] Review screen component tests in `src/features/srs/ReviewRoute.test.tsx` (jsdom + `renderWithVault`/`makeReadyDb` + seeded due cards): only due cards shown; **the back is absent from the DOM until reveal** (retrieval-before-reveal, FR-005); four grade buttons appear only post-reveal; the confidence 1–5 control has **no preselected value** and grading is disabled until one is picked (R11/Constitution III); grading advances + the remaining count drops; empty → "All caught up"; vault gate when no vault; re-key on vault switch. (ui-srs.md.)
- [X] T010 [US1] Implement `useReview.ts` (keyed `[db, vaultId]` via `useActiveVaultId()`; read the cap with `getSetting("srs.dailyNewCap")` default 20; `listDueCards`; reveal/grade/confidence/elapsed state; `recordReview`) in `src/features/srs/useReview.ts` (depends Phase 2).
- [X] T011 [US1] Implement `ReviewRoute.tsx` (vault gate → `ReviewSession`) and `ReviewSession.tsx` (front → reveal → grades via `Segmented` + per-grade `preview` hints; confidence via a no-default control; a small "new cards/day" cap input that writes the setting; "caught up" empty state) in `src/features/srs/` (depends T010; satisfies T009).
- [X] T012 [US1] Flip `/review` from placeholder to the real screen: `implemented: true` in `src/app/navigation.ts` and route element → `ReviewRoute` in `src/app/router.tsx` (depends T011).
- [X] T013 [US1] Dashboard due count: replace the `DeferredTiles` "Due cards" placeholder with a live `countDueCards(db, vaultId, now, cap)` (clicking routes to `/review`); extend `useDashboard.ts` (still `[db, vaultId]`-keyed) and update `src/features/dashboard/*.test.tsx` — in `src/features/dashboard/`. (ui-srs.md; real data only — Constitution III.)

**Checkpoint**: a complete review loop is usable; the dashboard reflects a real due count.

---

## Phase 4: User Story 2 - Author cards manually (Priority: P2)

**Goal**: A new Course-detail screen where the user creates/edits/deletes front/back cards on a Course (optionally linked to a milestone/note), feeding the review loop.

**Independent Test**: From a Course detail, add a card → it appears and becomes due; edit front/back → change sticks without resetting its schedule; delete → it leaves the queue with its review history.

- [X] T014 [P] [US2] Course-detail + card-form component tests in `src/features/courses/CourseDetailRoute.test.tsx`: create a card (front/back) on the course → listed + reviewable; edit content persists and does **not** reset scheduling (FR-011); delete removes it; optional milestone/note links saved. (ui-srs.md.)
- [X] T015 [US2] Implement `CourseDetailRoute.tsx` (vault-gated; course header + cards list via `listCardsByCourse`; add/edit/delete wiring) in `src/features/courses/` (depends Phase 2).
- [X] T016 [US2] Implement `CardForm.tsx` (front, back, optional milestone + note path; `createCard`/`updateCardContent`/`deleteCard`) in `src/features/courses/` (depends T015; satisfies T014).
- [X] T017 [US2] Add the `/courses/:courseId` route in `src/app/router.tsx` and link each row of the Courses list to it in `src/features/courses/CoursesRoute.tsx` (depends T015).

**Checkpoint**: cards are authored on the Course detail and flow into Review.

---

## Phase 5: User Story 3 - Calibrate confidence (Priority: P3)

**Goal**: Surface "overconfident" cards (high confidence + failed) on the dashboard. *(Confidence capture itself ships in US1 — it is required to record a review; US3 adds the analytical surface.)*

**Independent Test**: Review a card with confidence 5 graded "Again" → it appears under Overconfident on the dashboard; a card graded "Good" with confidence 4 does not.

- [X] T018 [P] [US3] `getOverconfidentCards` tests (extend `src/db/repositories/reviews.test.ts`): a card whose **latest** review has `confidence >= 4 AND rating = 'again'` is selected; `good`+confidence 4 is not; results are vault-scoped via the `course → domain.vault_id` join. (R11.)
- [X] T019 [US3] Implement `getOverconfidentCards(db, vaultId)` in `src/db/repositories/reviews.ts`; export from `src/db/index.ts` (satisfies T018).
- [X] T020 [P] [US3] Overconfident tile tests in `src/features/dashboard/OverconfidentTile.test.tsx`: renders seeded overconfident cards; calm empty state when none (no fabricated data). 
- [X] T021 [US3] Implement `OverconfidentTile.tsx` and wire it into `useDashboard.ts` + the dashboard view (`[db, vaultId]`-keyed) in `src/features/dashboard/` (depends T019; satisfies T020).

**Checkpoint**: calibration insight is visible on the dashboard.

---

## Phase 6: User Story 4 - Register Resources & cite sources (Priority: P4)

**Goal**: A vault-scoped Resource registry (8 kinds, per-kind metadata, CRUD, Course links) and card citations — Resource deep-links (best-effort via `tauri-plugin-opener`) and Obsidian block-refs written through `VaultWriter`. *(Self-contained: own migration + repos + screens — splittable into its own feature if deferred.)*

**Independent Test**: Register a Resource and link it to a Course; cite it on a card with a locator → on review the citation shows and opens the source at its locator; cite a note paragraph → a stable `^cic-…` marker is written into the note idempotently; switching vaults shows only the active vault's Resources.

- [X] T022 [P] [US4] Migration tests for `m0004_srs_scoping` in `src/db/migrate.srs.test.ts` (`node:sqlite`): forward v3→v4 adds `resources.vault_id` + `idx_resources_vault_id` + `cards.note_block_id`; pre-migration `resources`/`cards` rows survive (lossless, new columns NULL); re-running at v4 is a no-op.
- [X] T023 [US4] Implement `src/db/migrations/m0004_srs_scoping.ts` (`ALTER TABLE resources ADD COLUMN vault_id` + index, `ALTER TABLE cards ADD COLUMN note_block_id`) and append to `src/db/migrations/index.ts` (satisfies T022). **Also bump the three latest-version migration tests** (in `src/db/migrate.test.ts` expect `{from:0,to:4,applied:4}` + `user_version` 4 + the new index/columns; in `src/db/migrate.evolution.test.ts` bump the ad-hoc dummy migration → **version 5**; in `src/db/migrate.lossless.test.ts` bump its added migration → **version 5**) and `src/db/repositories/settings.test.ts` (`result.to` 3→4) — registering a real v4 otherwise breaks their "latest = v3" assertions and the runner's duplicate-version guard (R9).
- [X] T024 [P] [US4] `resources` repo + metadata tests in `src/db/repositories/resources.test.ts` (`node:sqlite`): `registerResource` stamps `vault_id` + `added_at` and validates per-kind `metadata` (zod discriminated union — book/pdf/video/etc., R13); `listResources` is vault-scoped (two-vault isolation, R6); `updateResource`/`deleteResource`; `linkResourceToCourse` (role) + `listCourseResources`; deleting a Resource cascades its links without orphaning cards.
- [X] T025 [US4] Implement the `ResourceMetadata` zod discriminated union (in `src/db/models/resourceMetadata.ts`) and the `resources` repo (`registerResource`, `attachResources` adopt, `listResources`, `updateResource`, `deleteResource`, `linkResourceToCourse`, `unlinkResourceFromCourse`, `listCourseResources`) in `src/db/repositories/resources.ts`; export from `src/db/index.ts` (depends T023; satisfies T024).
- [X] T026 [P] [US4] `cardResources` repo tests in `src/db/repositories/cardResources.test.ts`: `addCardResource` (with locator) upserts; `removeCardResource`; `listCardResources` returns resource + locator; cascade on card or resource delete.
- [X] T027 [US4] Implement the `cardResources` repo (`addCardResource`, `removeCardResource`, `listCardResources`) in `src/db/repositories/cardResources.ts`; export from `src/db/index.ts` (satisfies T026).
- [X] T028 [P] [US4] Block-id + block-ref tests in `src/features/srs/citations/blockId.test.ts` and `blockRef.test.ts` (node fs adapter + `makeTempVault`): `blockIdFor` is deterministic; `ensureBlockMarker` is idempotent and modifies only the target paragraph; `citeNoteParagraph` reads then writes via `VaultWriter`, returns `cited`/`absent`/`unchanged`/`conflict`, and **never clobbers** a drifted note. (blockref-citations.md.)
- [X] T029 [US4] Implement `blockId.ts` (`blockIdFor`, `ensureBlockMarker` — pure) and `blockRef.ts` (`citeNoteParagraph` via `VaultReader`/`VaultWriter`, conflict-aware with `overwrite`) in `src/features/srs/citations/` (satisfies T028).
- [X] T030 [P] [US4] Deep-link tests in `src/features/srs/citations/openTarget.test.ts`: `resourceTarget` builds the right target per kind+locator (pdf `#page=`, video_url `?t=`/`&t=`, web `#anchor`, file kinds `file://`, book/audio without a file → `null`); `openCitation` swallows failure into `{opened:false}` (no throw) with an injected opener. (R8.)
- [X] T031 [US4] Implement `openTarget.ts` (`resourceTarget` + `openCitation` wrapping `@tauri-apps/plugin-opener`, injected for tests) in `src/features/srs/citations/` (satisfies T030).
- [X] T032 [P] [US4] Resources screen tests in `src/features/resources/ResourcesRoute.test.tsx`: registry lists vault-scoped Resources; register/edit/delete with a kind-aware metadata form; link to a Course; delete confirms (destructive); vault gate + re-key on switch.
- [X] T033 [US4] Implement `ResourcesRoute.tsx` (vault-gated), `useResources.ts` (`[db, vaultId]`-keyed), and `ResourceForm.tsx` (kind-aware metadata fields per R13) in `src/features/resources/`; add `/resources` to `src/app/navigation.ts` + `src/app/router.tsx` (depends T025; satisfies T032).
- [X] T034 [US4] Extend `CardForm.tsx` with a citation editor — add/remove Resource citations + locator (`addCardResource`/`removeCardResource`), and cite a note paragraph (`citeNoteParagraph` → store `note_block_id`, surfacing a drift conflict with a "cite anyway" action); extend `updateCardContent` to persist `note_block_id` — in `src/features/courses/CardForm.tsx` + `src/db/repositories/cards.ts` (depends T027, T029, T023).
- [X] T035 [US4] Show a reviewed card's citations and wire the deep-link in `src/features/srs/ReviewSession.tsx` (`listCardResources` + `openCitation`; block-ref opens the note best-effort; missing source degrades gracefully with the locator text — FR-017/SC-006) (depends T031, T027).

**Checkpoint**: Resources are registered and cited; citations deep-link on review; block-refs round-trip into Obsidian.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T036 [P] PRD reconciliation: update `PRD-CIC-Platform.md` — F3 ships scaffolded across US1–US4 with F3.5/F3.6/F3.7 realized; the Resource **registration** half is pulled forward (the later Resources feature narrows to F2.3 assignments + F10.2 ingestion); note `m0004` (`resources.vault_id`, `cards.note_block_id`); bump the version + changelog.
- [X] T037 [P] Update `CLAUDE.md`: SPECKIT block 010 → **implemented** with the final summary; "Implemented: `001`–`010`"; refresh "Current focus" (Phase 2 progress).
- [X] T038 [P] Accessibility: the grade `Segmented` and the confidence control are keyboard-operable and labelled; the review advances via keyboard; extend `src/app/a11y.test.tsx`.
- [X] T039 Quality gate: `tsc` strict clean; ESLint clean — including the `no-restricted-imports` rule added in T004 that **fails the lint if `ts-fsrs` is imported outside `src/features/srs/fsrs/scheduler.ts`** (mechanical Constitution IV check, not a manual grep); `npm run build` clean; full Vitest suite green.
- [ ] T040 Run `quickstart.md` scenarios A–H live in `npm run tauri dev` (user-performed manual check — FSRS round-trip, opener deep-link, Obsidian block-ref, vault-switch re-scoping).

---

## Dependencies & Execution Order

### Phase order
- **Setup (P1)** → **Foundational (P2, blocks all stories)** → **US1 (P3)** → **US2 (P4)** → **US3 (P5)** → **US4 (P6)** → **Polish (P7)**.
- US2 and US3 depend only on Foundational; they can be built in parallel with each other (and after US1). US4 depends only on Foundational (+ its own migration) but extends US1's `ReviewSession` (T035) and US2's `CardForm` (T034), so it lands after those screens exist.

### Within a story
- The test task ([P]) is written first and fails; then its implementation task makes it pass.
- Repos/models before the hooks/screens that consume them; routing/nav wiring last.

### Parallel opportunities
- **Foundational:** T002 ∥ (then T003 ∥ T005 ∥ T007 as independent test files) — impls T004/T006/T008 follow their tests.
- **US4 data layer:** T024 ∥ T026 ∥ T028 ∥ T030 (independent test files) before their impls.
- **Polish:** T036 ∥ T037 ∥ T038.

---

## Parallel Example: Foundational engine + repos

```text
# Engine + repo tests (different files, no cross-dependency) — write first:
T003  src/features/srs/fsrs/scheduler.test.ts
T005  src/db/repositories/cards.test.ts
T007  src/db/repositories/reviews.test.ts
# Then implement to green: T004 (scheduler) → T006 (cards) → T008 (reviews, needs both).
```

---

## Implementation Strategy

### MVP (US1 + US2)
1. Setup (T001) → Foundational (T002–T008) → **US1** (T009–T013): a working review loop + real due count.
2. Add **US2** (T014–T017): author cards on the Course detail. **STOP & VALIDATE** — this is a demoable MVP: create a card, review it, see it reschedule.

### Incremental delivery
3. **US3** (T018–T021): calibration surface.
4. **US4** (T022–T035): Resources registry + citations. *(If US4 proves too large, split it into Feature 011 — it owns its migration, repos, and screens, and only touches US1/US2 at two extension points T034/T035.)*
5. **Polish** (T036–T040): PRD/CLAUDE reconciliation, a11y, quality gate, live quickstart.

---

## Notes
- `[P]` = different file, no dependency on an incomplete task.
- `ts-fsrs` is imported **only** in `src/features/srs/fsrs/scheduler.ts`, enforced by an ESLint `no-restricted-imports` rule (added in T004, checked in T039) — Constitution IV, mechanical not convention.
- Confidence has **no default** and a card is "learned" only via a real review (Constitution III) — enforced in US1 (T009/T011).
- The block-ref write is the only new `.md` surface and goes through `VaultWriter` (Constitution I; T028/T029).
- Commit after each task or logical group; keep the tree green (tsc + lint + tests).
