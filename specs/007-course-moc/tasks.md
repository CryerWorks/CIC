---
description: "Task list for Feature 007 — Course Authoring & MOC Materialization"
---

# Tasks: Course Authoring & MOC Materialization

**Input**: Design documents from `specs/007-course-moc/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution §V + CLAUDE.md require unit tests for data-integrity surfaces (MOC render/merge/parse, sync, repository round-trips), and each contract lists explicit test obligations. UI gets component tests.

**Organization**: By user story (US1 P1 → US2 P2 → US3 P3), after a shared Setup + Foundational (the pure MOC module spine) phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task → parallelizable
- File paths are exact and relative to the repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the feature's home; confirm no new tooling needed.

- [X] T001 Create the feature directory structure `src/features/courses/` with `moc/` and `sync/` subfolders (per plan.md Project Structure).
- [X] T002 Confirm no new runtime dependencies are needed and that `tsconfig`/`eslint` already cover `src/**` (the vendor-import rule must remain limited to `src/ai/adapters` + `src/vault/adapters` + `src/db/adapters`; this feature adds no vendor imports).

---

## Phase 2: Foundational (Blocking Prerequisites) — the pure MOC document module

**Purpose**: The pure, I/O-free MOC document spine (`src/features/courses/moc/`) that ALL stories compose (Constitution IV — spine before consumers). Fully unit-tested.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Define marker constants (`cic:capability|milestones|resources|projects|sessions|notes`) + the canonical section order in `src/features/courses/moc/markers.ts`.
- [X] T004 [P] Define `MocModel`, `MocMilestoneModel`, `ParsedMoc`, and the `MocParseError` class in `src/features/courses/moc/model.ts`.
- [X] T005 [P] Define `MocCourseFrontmatterSchema` (zod: `cic-type` literal, `cic-id`, `title`, `domain`, `campaign` nullable) in `src/features/courses/moc/frontmatter.ts`.
- [X] T006 [P] Unit tests for milestone line render/parse (all 3 statuses round-trip; checkbox glyph mapping; a comment-less user line parses with `id: null`) in `src/features/courses/moc/milestoneLine.test.ts`.
- [X] T007 Implement `renderMilestoneLine` + `parseMilestoneLine` in `src/features/courses/moc/milestoneLine.ts` (depends on T004; satisfies T006).
- [X] T008 [P] Unit tests for `buildFrontmatter` + `renderMocBody` (0/1/N milestones; empty capability; all sections present in canonical order; empty skeleton sections) in `src/features/courses/moc/render.test.ts`.
- [X] T009 Implement `buildFrontmatter` + `renderMocBody` in `src/features/courses/moc/render.ts` (depends on T003/T004/T005/T007; satisfies T008).
- [X] T010 [P] Unit tests for `mergeMocBody` (idempotency on app output; `## Reflections` + inter-section prose preserved across ≥3 merges; missing-section re-insertion; no marker duplication) in `src/features/courses/moc/merge.test.ts`.
- [X] T011 Implement `mergeMocBody` in `src/features/courses/moc/merge.ts` (depends on T003/T009; satisfies T010).
- [X] T012 [P] Unit tests for `parseMocBody` (extracts capability + ordered milestones; empty sections OK; unterminated marker → `MocParseError`) in `src/features/courses/moc/parse.test.ts`.
- [X] T013 Implement `parseMocBody` in `src/features/courses/moc/parse.ts` (depends on T003/T004/T007; satisfies T012).
- [X] T014 [P] Unit tests for `mocRelPathFor` (human-readable slug; illegal-char stripping; collision suffixing; never returns a path already in `taken`) in `src/features/courses/moc/filename.test.ts`.
- [X] T015 Implement `mocRelPathFor` in `src/features/courses/moc/filename.ts` (satisfies T014).
- [X] T016 Export the pure surface (`renderMocBody`, `mergeMocBody`, `parseMocBody`, `buildFrontmatter`, `mocRelPathFor`, `MocCourseFrontmatterSchema`, types) from `src/features/courses/moc/index.ts`.

**Checkpoint**: The MOC document module is complete and green. Stories can begin.

---

## Phase 3: User Story 1 - Create a Course → MOC appears in the vault (Priority: P1) 🎯 MVP

**Goal**: Create a Course (title, Domain, optional Campaign, Capability, ordered Milestones) and have a clean MOC file appear in the connected vault.

**Independent Test**: Against a node temp vault, create a Course with 2 milestones; assert the MOC file exists with capability + both lines and `course.moc_path` is set; in the UI, the empty state → create → the course appears under its Domain.

### Repositories (db spine additions)

- [ ] T017 [P] [US1] Add `updateCourse(db,id,patch)` + `listCourses(db)` to `src/db/repositories/courses.ts` (per contracts/course-repos.md).
- [ ] T018 [P] [US1] Create `src/db/repositories/campaigns.ts` (`listCampaignsByDomain`, `createCampaign`, `getCampaign`) and export it from `src/db/index.ts`.
- [ ] T019 [US1] Repository tests for the US1 additions (updateCourse patch + round-trip; listCourses; campaign create/list) in `src/db/repositories/courses.test.ts` (depends on T017/T018).

### Sync (materialize)

- [ ] T020 [US1] Integration test for materialize/new (node temp vault + `node:sqlite`): a Course + 2 milestones → `Courses/<Title>.md` with capability + two milestone lines; `course.moc_path` persisted — in `src/features/courses/sync/materialize.test.ts`.
- [ ] T021 [US1] Implement `materializeCourse(deps, model)` in `src/features/courses/sync/materialize.ts`: pick path (`course.moc_path` else `mocRelPathFor` over existing paths), render-or-merge, `writer.writeNote`, persist `moc_path` via `updateCourse`; return `MaterializeResult` (depends on T016/T017; satisfies T020).

### UI (Courses screen)

- [ ] T022 [P] [US1] Implement the `useCourses` hook (list grouped by Domain; create Course + Milestones; create a Campaign inline via `createCampaign` when the form supplies a new name; assemble `MocModel` + call `materializeCourse`; optimistic pattern mirroring `useDomains`) in `src/features/courses/useCourses.ts`.
- [ ] T023 [P] [US1] Implement `CourseForm` (title; **required** Domain select; optional Campaign — pick an existing one *or* create a new Campaign inline by name; Capability textarea) in `src/features/courses/CourseForm.tsx`. The form MUST block submit without a Domain (FR-005).
- [ ] T024 [P] [US1] Implement `MilestonesEditor` (add ordered milestones with capability + status) in `src/features/courses/MilestonesEditor.tsx`.
- [ ] T025 [US1] Implement `CoursesRoute` (vault-gated via `useVaultState()`: guidance→`/vault` when not ready; empty state; when no Domain exists, guide to create one first per US1-AS3; list grouped by Domain; new-course flow) in `src/features/courses/CoursesRoute.tsx` (depends on T022/T023/T024).
- [ ] T026 [US1] Wire the route: import `CoursesRoute` from `src/features/courses/` in `src/app/router.tsx`, set Courses `implemented: true` in `src/app/navigation.ts`, and delete the placeholder `src/app/routes/CoursesRoute.tsx` (depends on T025).
- [ ] T027 [US1] Component test for the create flow + vault-gating (unset vault → guidance link to `/vault`; ready vault → create → course appears; submit blocked without a Domain) in `src/features/courses/CoursesRoute.test.tsx` (depends on T025/T026).

**Checkpoint**: A Course created in-app materializes as a clean MOC in the vault. MVP complete.

---

## Phase 4: User Story 2 - Edit in-app, update the MOC without losing my own writing (Priority: P2)

**Goal**: Edit a Course (rename, capability, milestones add/edit/reorder/retire); the MOC's managed sections update while `## Reflections` and out-of-marker prose are preserved; external drift is surfaced, not clobbered.

**Independent Test**: Materialize a MOC, append a Reflections paragraph on disk, edit a milestone in-app, re-materialize → milestone updated, Reflections intact; then externally edit inside the markers → re-materialize returns `conflict("drifted")`; Reload & reapply → written, no loss.

### Repositories

- [ ] T028 [P] [US2] Add `updateMilestone(db,id,patch)` + `deleteMilestone(db,id)` to `src/db/repositories/milestones.ts`; add repo tests in `src/db/repositories/milestones.test.ts`.

### Sync (update + drift)

- [ ] T029 [US2] Integration tests in `src/features/courses/sync/materialize.test.ts` (extend): update preserves Reflections (SC-002); external in-marker edit → `conflict("drifted")`; Reload & reapply → `written` with no data loss.
- [ ] T030 [US2] Extend `materializeCourse` to return the typed `conflict` on writer drift and add the `reloadAndReapply(deps, model)` path (re-read → re-merge → `writeNote({overwrite:true})`) in `src/features/courses/sync/materialize.ts` (depends on T021; satisfies T029).

### UI (edit)

- [ ] T031 [US2] Extend `useCourses` with edit: pre-fill capability by reading + `parseMocBody` of the course's MOC, pre-fill milestones from `listMilestonesByCourse`, persist edits, re-materialize, and expose drift state + a `resolveDrift` action in `src/features/courses/useCourses.ts` (depends on T030).
- [ ] T032 [US2] Extend `MilestonesEditor` for edit / reorder / retire in `src/features/courses/MilestonesEditor.tsx`.
- [ ] T033 [US2] Add the edit panel + drift notice with a "Reload & reapply" action to `src/features/courses/CoursesRoute.tsx` (depends on T031/T032).
- [ ] T034 [US2] Component test for edit + Reflections-preservation messaging + drift UX in `src/features/courses/CoursesRoute.test.tsx` (extend) (depends on T033).

**Checkpoint**: Editing round-trips safely; user-owned content is never clobbered; drift is surfaced with a non-destructive resolution.

---

## Phase 5: User Story 3 - Edit a Course MOC in Obsidian → the app catches up (Priority: P3)

**Goal**: On app open / manual Rescan, scan the vault, reconcile known Course MOCs (capability + milestones), import unknown CIC-marked MOCs (auto-creating named Domain/Campaign), ignore non-CIC files, and skip-with-notice on malformed MOCs.

**Independent Test**: Materialize a MOC, edit capability + add a milestone line on disk, `rescanCourses` → app matches the file; hand-author a new CIC MOC → imported; a plain `.md` → ignored; an unterminated-marker CIC MOC → skipped with a note; a second rescan is a no-op.

### Repositories

- [ ] T035 [P] [US3] Add `upsertCourseRow` + `getCourseByMocPath` to `src/db/repositories/courses.ts`, `syncCourseMilestones` to `src/db/repositories/milestones.ts`, `findOrCreateDomainByName` to `src/db/repositories/domains.ts`, and `findOrCreateCampaignByTitle` to `src/db/repositories/campaigns.ts`; add tests (upsert idempotency; syncCourseMilestones insert/update/delete-missing + order; findOrCreate* case-insensitive reuse) in the respective `*.test.ts`.

### Sync (rescan)

- [ ] T036 [US3] Integration tests for `rescanCourses` (round-trip SC-003; import SC-006 + auto-create Domain; **moved/renamed file** — same `cic-id`, changed path → re-matches the existing Course and updates `moc_path`, FR-016; ignore non-CIC; malformed → skip-with-notice FR-019; idempotent; never calls `fs.remove` on a vault file) in `src/features/courses/sync/rescan.test.ts`.
- [ ] T037 [US3] Implement `rescanCourses(deps)` in `src/features/courses/sync/rescan.ts`: `reader.list` → `readNoteAs(MocCourseFrontmatterSchema)` discriminate/skip → `parseMocBody` → resolve domain/campaign → `upsertCourseRow` → `syncCourseMilestones` (mint ids for comment-less lines) → `RescanReport` (depends on T016/T035; satisfies T036).

### UI (rescan action + boot trigger)

- [ ] T038 [US3] Add a "Rescan vault" button to `src/features/courses/CoursesRoute.tsx` and a vault-ready boot trigger (run `rescanCourses` once when the vault becomes `ready`, refresh the list, surface a `RescanReport` summary) in `src/features/courses/useCourses.ts` (depends on T037).
- [ ] T039 [US3] Component test for the rescan action + report surfacing using a fake vault reader returning one CIC MOC, in `src/features/courses/CoursesRoute.test.tsx` (extend) (depends on T038).

**Checkpoint**: All three stories independently functional; the in-app ↔ vault loop is closed.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T040 [P] Add a `src/features/courses/index.ts` barrel if any cross-module import needs it; verify the ESLint vendor-import rule is unaffected by the new feature.
- [ ] T041 Run the full gate — `npm run test` (Vitest), `tsc --noEmit` (strict), `npm run lint` — and fix any regressions (especially fallout from removing the placeholder `CoursesRoute`).
- [ ] T042 Run the [quickstart.md](./quickstart.md) scenarios A–F in `npm run tauri dev` (manual runtime check — the live `VaultWriter` + Obsidian round-trip; the user's surface).
- [ ] T043 [P] After implementation: update the CLAUDE.md SPECKIT block to "implemented". (The R2 capability-markers refinement was already reconciled into the PRD §F1 template as **v0.9.1** during `/speckit-analyze` — no further PRD action needed.)

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup. **Blocks all stories** (the pure MOC module).
- **US1 (P3)** → after Foundational. The MVP.
- **US2 (P4)** → after US1 (edits the screen + extends `materializeCourse` that US1 introduces).
- **US3 (P5)** → after Foundational; integrates with the US1 screen for the Rescan action (sync/repos are independent of US2).
- **Polish (P6)** → after the desired stories.

### Within a story
- Tests precede the implementation they cover (write failing test → implement → green).
- Repositories → sync → UI.

### Parallel opportunities
- Foundational: T003/T004/T005 in parallel; each test task [P] is parallel to other modules' tests; impl tasks follow their tests.
- US1: T017 ‖ T018 (different repo files); T022 ‖ T023 ‖ T024 (different UI files) once the hook's repo deps exist.
- US3 repos (T035) are [P] across the four repository files.

---

## Parallel Example: Foundational module scaffolding

```bash
# Independent declaration files first:
Task: "Define markers in src/features/courses/moc/markers.ts"         # T003
Task: "Define MocModel types in src/features/courses/moc/model.ts"     # T004
Task: "Define MocCourseFrontmatterSchema in .../moc/frontmatter.ts"    # T005
```

## Parallel Example: User Story 1 UI

```bash
Task: "Implement useCourses hook in src/features/courses/useCourses.ts"        # T022
Task: "Implement CourseForm in src/features/courses/CourseForm.tsx"            # T023
Task: "Implement MilestonesEditor in src/features/courses/MilestonesEditor.tsx" # T024
```

---

## Implementation Strategy

### MVP first (US1 only)
1. Setup → 2. Foundational (the pure MOC module, green) → 3. US1 → **STOP & validate**: a created Course appears as a MOC in the vault (quickstart Scenario A). Demoable.

### Incremental delivery
- + US2 → safe editing + never-clobber + drift UX (Scenarios B, C).
- + US3 → read-back + import (Scenarios D, E, F).
- Each story adds value without breaking the previous.

---

## Notes
- [P] = different file, no incomplete-task dependency.
- The pure `moc/` module is I/O-free and must stay that way — no vault/db/React imports there (Constitution IV).
- All `.md` writes go through `VaultWriter` only; no sync path deletes a vault file.
- Capability text lives in the MOC (no SQLite column); the edit flow reads it back via `parseMocBody` (data-model.md note).
- Commit after each story/logical group; the working tree stays green (lint + tests).
