---
description: "Task list for Feature 015 — Projects (Applied Practice, MVP)"
---

# Tasks: Projects — Applied Practice (MVP)

**Input**: Design documents from `specs/015-projects-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: INCLUDED — the Constitution mandates Vitest for the data-integrity surfaces touched here (vault read/write round-trip, frontmatter parsing, repository mutations) and every prior feature shipped tests. Node-env tests use `NodeSqlExecutor` (+ a temp vault for sync); component tests use jsdom test-support (no jest-dom matchers).

**Organization**: By user story (P1 → P2 → P3), each independently testable. Spec dir is `015`; PRD feature label is **F11**.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 (user-story phases only)

## Path Conventions

Single project, repo root. Feature code under `src/features/projects/`; data layer under `src/db/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module skeleton. No new dependencies; no `src-tauri/` change this feature.

- [X] T001 Create the `src/features/projects/` feature-module skeleton with `doc/` and `sync/` subdirectories per [plan.md](./plan.md) structure (files added by later tasks).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The migration, the model, the pure document module, the repository core, and the `createCard` extension — everything every user story depends on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

### Migration (schema 7 → 8)

- [X] T002 Create `src/db/migrations/m0008_project_authoring.ts` (mirror m0007's style + self-heal doc comment): `ALTER TABLE projects ADD COLUMN title TEXT NOT NULL DEFAULT '';` + `CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);` + `CREATE INDEX IF NOT EXISTS idx_cards_project_id ON cards(project_id);` (version 8, name `project_authoring`).
- [X] T003 Register `m0008ProjectAuthoring` in the ordered array in `src/db/migrations/index.ts` (append after m0007; never reorder).
- [X] T004 Bump the four version-pinned tests 7 → 8 (read each file's current pinned value first, then update): `src/db/migrate.test.ts`, `src/db/migrate.evolution.test.ts`, `src/db/migrate.lossless.test.ts`, `src/db/repositories/settings.test.ts`.

### Model

- [X] T005 [P] Add `title: z.string()` to `ProjectSchema` in `src/db/models/project.ts` (non-empty enforced at the repo/form boundary, not in the schema).

### Pure document module (`src/features/projects/doc/`) — mirrors `courses/moc/`, body learner-owned

- [X] T006 [P] Create `src/features/projects/doc/markers.ts` — `PROJECT_DISCRIMINATOR = "project"` (the `cic-type` value); document that there are **no** managed body-section markers (body is learner-owned).
- [X] T007 [P] Create `src/features/projects/doc/model.ts` — `ProjectDocModel` (incl. `courseId` for the stable `course-id` link — M2; `milestoneIds` is 0..N at read time — M3), `ParsedProject`, `ProjectParseError` types per [contracts/project-document.md](./contracts/project-document.md).
- [X] T008 Create `src/features/projects/doc/frontmatter.ts` — `ProjectFrontmatterSchema` (zod; discriminator `cic-type: project`, `cic-id`, **`course-id`** (stable course link — M2), `title` min1, `course` (display only), `capability` min1, `status`, `milestones` default `[]`, `opened`, optional `closed`/`template`) + `buildFrontmatter(model)` (emits `course-id: model.courseId`; omits null `closed`/`template`). Depends on T007.
- [X] T009 [P] Create `src/features/projects/doc/templates.ts` — `PROJECT_TEMPLATES` + `renderTemplateBody(name | null, framing?)` returning the seed body for `math/proof` · `cs/implement` · `freeform` (null → freeform); when `framing` is non-blank, weave it once into the `## Problem` section (M1). Pure strings; never validators.
- [X] T010 Create `src/features/projects/doc/render.ts` — `renderProjectDoc(model, framing?)` = frontmatter block + `renderTemplateBody(model.template, framing)` (used once at creation; framing forwarded to Problem — M1). Depends on T008, T009.
- [X] T011 Create `src/features/projects/doc/parse.ts` — `parseProjectFile({ data, body })` → `ParsedProject | ProjectParseError` (validate frontmatter, surface body untouched, never throw). Depends on T007, T008.
- [X] T012 Create `src/features/projects/doc/merge.ts` — `swapFrontmatter(existingBody, model)` (returns `{ frontmatter, body: existingBody }` — body verbatim) + `appendReflection(existingBody, reflection, closedDate)` (additive `## Reflection (closed …)`; no-op when blank). Depends on T008.
- [X] T013 [P] Create `src/features/projects/doc/filename.ts` — `projectFilename(title, id)` slug under `Projects/` with a short id suffix (mirror `moc/filename.ts`).
- [X] T014 Create `src/features/projects/doc/index.ts` — barrel exports for the module. Depends on T006–T013.
- [X] T015 Create `src/features/projects/doc/doc.test.ts` — invariants: parse∘render round-trip (incl. `course-id` — M2); `swapFrontmatter` never mutates body; `appendReflection("")` is a no-op; `renderTemplateBody` total over all names + null; **non-blank framing lands under `## Problem`, blank framing leaves the placeholder (M1)**; malformed frontmatter → `ProjectParseError` (no throw). Depends on T014.

### Repository core (`src/db/repositories/projects.ts`)

- [X] T016 Create `src/db/repositories/projects.ts` with `createProject` (txn: `projects` row + `project_milestones` (≥1) + `project_resources` (0..N); throws on empty title/capability or 0 milestones), `getProject`, `listCourseProjects`, `listActiveProjects(vaultId)` (active-vault join project→course→domain→vault), `getProjectMilestoneIds`, `listProjectResources`, `setProjectMilestones` (replace set; ≥1 + same-Course enforced in-app), `setProjectResources`, `setProjectTitleCapability`. **The ≥1-milestone rule is a create/save-time invariant only — all reads (`getProject`/`listCourseProjects`/`getProjectMilestoneIds`) MUST return a zero-milestone Project normally (M3), never throw or filter it.** Depends on T005, T002–T004. Per [contracts/projects-repository.md](./contracts/projects-repository.md).
- [X] T017 [P] Extend `createCard` in `src/db/repositories/cards.ts` with optional `projectId` (defaults null; sets `cards.project_id`).
- [X] T018 Create `src/db/repositories/projects.test.ts` (node env): create + links round-trip; the ≥1-milestone + same-Course guards; `listCourseProjects` ordering; `listActiveProjects` vault scoping; `setProjectMilestones`/`setProjectResources` replace semantics; **deletion-survival (M3/FR-020): deleting a referenced Milestone drops only the `project_milestones` join (Project survives, incl. ending at zero milestones); deleting a referenced Resource drops only the `project_resources` join.** Depends on T016.
- [X] T019 [P] Create `src/features/projects/sync/deps.ts` — `ProjectSyncDeps { db; vault }` interface.

**Checkpoint**: Schema migrated, doc module + repo core green. User stories can begin.

---

## Phase 3: User Story 1 — Author a Project (Priority: P1) 🎯 MVP

**Goal**: From a Course's detail screen, create a Project (title + ≥1 milestone + capability, optional template/framing/resources) → it materializes as a clean vault Markdown file and is listed under the Course.

**Independent Test**: With a vault + a Course with a Milestone, create a Project; confirm it's listed `open` and a readable `Projects/….md` exists with the expected `cic-type: project` frontmatter + template body.

- [X] T020 [US1] Create `src/features/projects/sync/materialize.ts` — `materializeNewProject(deps, model, framing?)` (writeNote `renderProjectDoc(model, framing)`, `{ overwrite:false }`, then set `projects.project_path`; framing woven into Problem once — M1), `updateProjectFrontmatter` (read → `swapFrontmatter` → writeNote), `reapplyProject` (re-read → swap → `{ overwrite:true }`). Typed `MaterializeProjectResult`. Depends on T014, T016, T019. Per [contracts/project-sync.md](./contracts/project-sync.md).
- [X] T021 [US1] Create `src/features/projects/sync/materialize.test.ts` (node env + temp vault + `NodeSqlExecutor`): create writes frontmatter (incl. `course-id`) + template body, and a provided framing lands in the Problem section (M1); `updateProjectFrontmatter` rewrites frontmatter and preserves the body verbatim. Depends on T020.
- [X] T022 [US1] Create `src/features/projects/useProjects.ts` — hook: `loading`, `projects`, `milestones`, `resources`, `create()` (repo.createProject → `materializeNewProject(model, framing)` → refresh; threads the form's framing — M1), `edit()`, `pendingReapply`, `refresh()`; DI via `useDb`/`useVault`/`useActiveVaultId`. Depends on T016, T020.
- [X] T023 [P] [US1] Create `src/features/projects/ProjectForm.tsx` — title, capability (one-line), milestones multi-select (≥1, limited to the Course's milestones), template select, optional framing (passed to create → woven into Problem — M1), optional resource rows (select + locator); save disabled until title + capability + ≥1 milestone; **when editing a Project that currently has zero milestones (left by a Milestone deletion), open without error and re-require ≥1 only on save (M3)**; `aria-label`s on all controls.
- [X] T024 [US1] Create `src/features/projects/ProjectsSection.tsx` (list: title, capability dimmed, status chip, milestone/resource counts; "New Project" → ProjectForm; calm empty state, no nudge) and mount `<ProjectsSection courseId=… />` in `src/features/courses/CourseDetailRoute.tsx`. Depends on T022, T023.
- [X] T025 [US1] Create `src/features/projects/ProjectsSection.test.tsx` (jsdom): create blocked until title + capability + ≥1 milestone; milestone picker shows only the Course's milestones; created Project appears in the list. Depends on T024.

**Checkpoint**: US1 fully functional — author a Project, file in vault, listed.

---

## Phase 4: User Story 2 — Work a Project and close it with a reflection (Priority: P2)

**Goal**: Advance a Project `open → in-progress` (via a session planned against it or manual), then close it `complete`/`abandoned` with a reflection, optionally spawning manual cards.

**Independent Test**: Given an `open` Project, plan a session against it → `in-progress`; close `complete` with a reflection, spawn one card → card (linked to the Project) enters the review queue; nothing auto-marked mastered.

- [X] T026 [US2] Add to `src/db/repositories/projects.ts`: `markProjectInProgress` (idempotent `open → in-progress`; never auto-completes) and `closeProject({ projectId, outcome, cards?, citeResourceIds? })` (txn: set status+`closed_at`; each card → `createCard(tx, { courseId, front, back, projectId })` + optional `addCardResource`; empty `cards` spawns none). Depends on T016, T017.
- [X] T027 [US2] Extend `planSession` in `src/db/repositories/sessions.ts` with optional `projectId` (insert `sessions.project_id` + call `markProjectInProgress` in the same txn) and add `listSessionsForProject(db, projectId)`. Depends on T026.
- [X] T028 [US2] Extend tests: `src/db/repositories/projects.test.ts` (`closeProject` spawns exactly the confirmed cards with `project_id`, none when empty, no path sets `complete` without an explicit close) and `src/db/repositories/sessions.test.ts` (`planSession` with `projectId` flips `open → in-progress`). Depends on T026, T027.
- [X] T029 [US2] Add `closeProjectFile(deps, model, reflection)` to `src/features/projects/sync/materialize.ts` (read → `appendReflection` → writeNote) and extend `materialize.test.ts` (reflection appended under a heading; existing body preserved). Depends on T020, T012.
- [X] T030 [P] [US2] Create `src/features/projects/CloseProjectDialog.tsx` — Complete vs Abandon (neutral, non-failure copy), reflection textarea, optional manual card-spawn rows ("Add card" front/back), optional cite-resources; modal a11y mirroring `DeleteCourseDialog`.
- [X] T031 [US2] Extend `src/features/courses/SessionPlanner.tsx` with an optional Project picker (the Course's `open`/`in-progress` Projects) → `PlanFormInput.projectId`; thread through `useCoursePlans.plan`. Depends on T027.
- [X] T032 [US2] Wire `markInProgress` + `close` into `src/features/projects/useProjects.ts` and surface affordances in `src/features/projects/ProjectsSection.tsx` (mark-in-progress when `open`, "Close…" when active, read-only completed/abandoned rows with outcome + closed date). Depends on T026, T029, T024.
- [X] T033 [US2] Create `src/features/projects/CloseProjectDialog.test.tsx` (jsdom): complete spawns only the confirmed rows; declining spawns none; abandon copy is neutral; nothing auto-marks mastery. Depends on T030, T032.

**Checkpoint**: US1 + US2 work — author, work via a session, close with reflection + manual cards.

---

## Phase 5: User Story 3 — Round-trip, dashboard visibility & safe deletion (Priority: P3)

**Goal**: Import Project files authored/edited in Obsidian on rescan; surface active Projects per Domain on the dashboard; delete a Project with a detach-or-delete-file choice that never destroys a file unconfirmed.

**Independent Test**: Create a valid Project `.md` in the vault, rescan → imported with milestones/capability/status intact; delete in-app → "detach" leaves a non-reimporting file.

- [X] T034 [US3] Add to `src/db/repositories/projects.ts`: `upsertImportedProject` (upsert by `cic-id` + reconcile `project_milestones` to the frontmatter ids, dropping unknowns) and `deleteProject` (delete row; cascade clears joins; `sessions`/`cards` `project_id` → NULL via FK). Depends on T016.
- [X] T035 [US3] Create `src/features/projects/sync/rescan.ts` — `rescanProjects(deps, vaultId)` (list → `readNoteAs(ProjectFrontmatterSchema)` discriminate `cic-type: project` → **resolve the Course by the frontmatter's `course-id`, never the human `course` title — M2**; skip if no Course in this vault has that id; `upsertImportedProject` reconciling milestones (unknown ids dropped → may import with 0 milestones, M3); skip malformed with a note; vault-read-only; idempotent). Depends on T011, T034.
- [X] T036 [US3] Create `src/features/projects/sync/delete.ts` — `removeProject(deps, id, mode, opts?)`: `detach` (strip `cic-type`/`cic-id`, writeNote `{overwrite:true}`, then `deleteProject`) | `deleteFile` (`deleteNote` with the overwrite guard → conflict unless `overwrite:true`, then `deleteProject`). Depends on T034.
- [X] T037 [US3] Create `src/features/projects/sync/rescan.test.ts` + `src/features/projects/sync/delete.test.ts` (node env + temp vault): import unknown by `course-id` (a file whose `course-id` matches no Course is skipped — M2); external frontmatter edit reflected; malformed skipped; a file referencing an unknown milestone id imports with that link dropped (M3); detach leaves a non-reimporting file; deleteFile drift → conflict (file + rows intact). Depends on T035, T036.
- [X] T038 [P] [US3] Create `src/features/projects/DeleteProjectDialog.tsx` — detach vs deleteFile radios + "Delete anyway" on drift/unmanaged conflict (mirror `DeleteCourseDialog`); a11y.
- [X] T039 [US3] Wire rescan (boot + a manual affordance) + `remove` into `src/features/projects/useProjects.ts` and `src/features/projects/ProjectsSection.tsx` ("Delete…" → `DeleteProjectDialog`). Depends on T035, T036, T038, T032 (note L2: this accretes onto US2's `ProjectsSection` — same file, so build US3 after US2; don't parallelize the two on this file).
- [X] T040 [US3] Add active-Projects-per-Domain to the dashboard read-model `src/db/repositories/dashboard.ts` (one grouped query joined to the active vault; count + minimal `{ id, title, courseId }` list). **Prefer an additive sibling field/read so the existing 008 `getDashboardSummary` shape + assertions stay green (L3); if the summary shape must change, update `src/db/repositories/dashboard.test.ts`'s existing expectations in this same task.** Add a node test for the new read. Depends on T016.
- [X] T041 [US3] Surface active-Projects-per-Domain in `src/features/dashboard/` (`useDashboard` load + a `DashboardView` section linking to the Course; render nothing when zero — Constitution III) + a jsdom test. Depends on T040.

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T042 [P] Reconcile `PRD-CIC-Platform.md`: add `projects.title` to §8, annotate F11 as MVP-shipped (manual/no-AI; deferrals intact), add a changelog entry (→ v0.9.10).
- [X] T043 [P] Update `CLAUDE.md` SPECKIT block: mark `015-projects-mvp` implemented, condense, update the "Next" line (Remaining: F10.2 ingestion / Phase 3 AI provider layer).
- [ ] T044 Full quality gate — fix any failures: `npx tsc --noEmit`, `npm run lint` (incl. `no-restricted-imports`), `npm run test` (Vitest), `npm run build` (vite), and `cargo check` (must remain clean — no `src-tauri/` change this feature).
- [ ] T045 Live `tauri dev` quickstart [quickstart.md](./quickstart.md) scenarios A–J (user-run) — confirm the real `VaultWriter`↔Obsidian round-trip, the OS file, freeform-body never-clobber, and the UI.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all user stories**. Within it: migration (T002→T003→T004) and model (T005) gate the repo (T016); the doc module (T006–T015) is independent of the DB and can proceed in parallel.
- **US1 (P3)** → after Foundational.
- **US2 (P4)** → after Foundational; builds on US1's hook/section (T032 depends on T024) but the repo/sync pieces are independent.
- **US3 (P5)** → after Foundational; T039 integrates with US2's wired section (T032).
- **Polish (P6)** → after the desired stories.

### Within each user story

- Sync/repo before the hook; hook before the section; dialogs (T030, T038) are independent files ([P]).
- Tests follow the code they cover (this repo verifies after, not strict TDD).

### Parallel opportunities

- **Foundational**: T005, T006, T007, T009, T013, T017, T019 are independent files → parallelizable. T008 gates T010/T011/T012; T014 gates T015; T016 gates T018.
- **US1**: T023 (ProjectForm) parallel with the sync/hook work (T020–T022).
- **US2**: T030 (CloseProjectDialog) parallel with repo/sync (T026–T029).
- **US3**: T038 (DeleteProjectDialog) parallel with sync/repo (T034–T037); dashboard (T040–T041) parallel with the delete/rescan wiring.
- **Polish**: T042, T043 are independent docs → [P].

---

## Parallel Example: Foundational doc module

```text
# After T007 (model types), launch the independent doc files together:
Task T006: markers.ts
Task T009: templates.ts
Task T013: filename.ts
# Then T008 (frontmatter) → T010/T011/T012 (render/parse/merge) → T014 (barrel) → T015 (tests)
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Setup (T001) → Foundational (T002–T019) → US1 (T020–T025).
2. **STOP & VALIDATE**: author a Project, confirm the vault file + listing (quickstart A–C).
3. That alone is a shippable increment — Projects can be captured against Milestones.

### Incremental delivery

- + US2 (T026–T033): work a Project, close with reflection + manual cards.
- + US3 (T034–T041): vault round-trip, dashboard visibility, safe deletion.
- Polish (T042–T045): docs reconcile + full gate + live quickstart.

---

## Notes

- **No `src-tauri/` change** — reuses the existing fs/sql/FSRS seams; `cargo check` should remain clean (verified in T044).
- **No AI** anywhere (F11.4 seeding is Phase 3.5).
- Guardrails enforced by specific tasks: no auto-complete / manual card-spawn (T026, T033), never-clobber body (T021, T029), confirmed delete + detach (T036, T037, T038), no fabricated dashboard data (T041).
- `/speckit-analyze` remediations folded in before coding: **M1** framing → woven into the created Problem section (T009/T010/T015/T020–T023); **M2** Project→Course round-trips by a stable `course-id`, not the human title (T008/T021/T035/T037); **M3** ≥1-milestone is a create/save invariant only — reads/rescan tolerate a zero-milestone Project, and FR-020 survival is tested (T016/T018/T023/T037); **L1** migration index typo fixed (T002); **L2** US3 builds after US2 on the shared `ProjectsSection` (T039); **L3** dashboard addition kept additive to protect the 008 tests (T040).
- `[P]` = different files, no incomplete-task dependency. `[Story]` labels trace tasks to spec user stories.
- Commit is held for the feature's single squash-style commit after the live quickstart clears (per the established 012–014 flow).
