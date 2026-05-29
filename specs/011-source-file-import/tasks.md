---
description: "Task list for Feature 011 — Source File Import & Local Storage"
---

# Tasks: Source File Import & Local Storage

**Input**: Design documents from `specs/011-source-file-import/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included — the project's quality gate requires Vitest coverage of data-integrity surfaces (migrations, repos) and the component flows (with a fake `SourceFiles`). The native copy/remove + the OS dialog cannot run under Vitest → covered by the live `tauri dev` quickstart, not by test tasks.

**Organization**: By user story (US1 P1 → US4 P3). Each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- File paths are exact and relative to the repo root.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Confirm `src-tauri/capabilities/default.json` already grants `dialog:allow-open` and `opener:default` (it does — no edit expected); note that no new npm/Cargo dependency is introduced by this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the file-store machinery that User Stories 1–3 all depend on. **⚠️ No US1/US2/US3 work begins until this phase is complete.** (US4 — Domain organization — does not depend on this phase.)

- [X] T002 Add the two custom Rust commands in `src-tauri/src/lib.rs` per [contracts/source-files.md](./contracts/source-files.md): `import_resource_file(app, source_path, resource_id, filename) -> Result<String,String>` and `remove_resource_files(app, resource_id) -> Result<(),String>`. Destination base fixed to `app_local_data_dir()/resources`; validate `resource_id` (charset `[0-9a-fA-F-]`), reduce `filename` to its basename, verify containment within the base (research R11); re-import is **copy-then-prune** — copy the new file in, then remove stale siblings only *after* the copy succeeds, so a failed copy leaves the prior file intact (R8, FR-011/SC-002); `remove` is a no-op when absent (R4). Register both in `invoke_handler`.
- [X] T003 [P] Create the `SourceFiles` seam + Tauri-backed default `tauriSourceFiles` in `src/features/resources/sourceFiles.ts` per the contract: `pickFile(kind)` (native dialog, per-kind extension filters, single-select → path|null), `importFile({sourcePath,resourceId,filename})` → `invoke("import_resource_file")`, `removeFiles(resourceId)` → `invoke("remove_resource_files")`. The only module importing `@tauri-apps/plugin-dialog` + `invoke` for this feature.
- [X] T004 Add a `SourceFilesProvider` + `useSourceFiles()` in `src/features/resources/SourceFilesProvider.tsx` (context defaulting to `tauriSourceFiles`); mount it in `src/main.tsx` (nesting with the existing `DbProvider`/`VaultProvider`), and extend `src/app/test-support.tsx` `renderApp` to accept a `sourceFiles` override so component tests inject a fake (research R6). Depends on T003.

**Checkpoint**: the file-store seam + native commands exist and are injectable — US1/US2/US3 can begin.

---

## Phase 3: User Story 1 — Attach a source file to a Resource (Priority: P1) 🎯 MVP

**Goal**: a learner picks a real file for a file-based Resource; the app internalizes a copy and records its path on the Resource.

**Independent Test**: register a PDF Resource, choose a file, save → the Resource reports an attached file and the original on disk is unchanged (copied, not moved).

- [X] T005 [US1] In `src/features/resources/ResourceForm.tsx`, for file-kinds (pdf, epub, markdown, video_file, audio) replace the free-text "File path" input with a **"Choose file…/Replace…"** button that calls `useSourceFiles().pickFile(kind)` and holds the picked source path + shows its basename; show the current stored filename on edit; URL-kinds keep the URL field (FR-006). Add a "Copying…" busy state + inline error region (FR-013/FR-011) per [contracts/ui-resources.md](./contracts/ui-resources.md).
- [X] T006 [US1] In `src/features/resources/useResources.ts`, wire the import: after `registerResource`/`updateResource`, if a file was picked, call `sourceFiles.importFile({sourcePath, resourceId, filename})` and persist the returned path via `updateResource(id,{filePath})`; on rejection surface the error and leave `file_path` unchanged (all-or-nothing — SC-002). Consume `useSourceFiles()`. (Same file as T010/T014 — sequential.)
- [X] T007 [US1] Component test in `src/features/resources/ResourcesRoute.test.tsx`: with an injected fake `SourceFiles` whose `pickFile` resolves to a path and `importFile` returns an internal path, register/edit a PDF, choose a file, save → assert the resource row ends with the internalized `file_path` and the UI shows it attached.

**Checkpoint**: file-based Resources can be given a stored file. MVP usable.

---

## Phase 4: User Story 2 — Open a cited source from a card (Priority: P2)

**Goal**: activating a citation to a file-based Resource opens its stored file at the locator. (Delivered largely by US1 setting `file_path`; the opener `resourceTarget` already consumes it — no change to `openTarget.ts`.)

**Independent Test**: attach a PDF, cite it on a card with `page=10`, open it from the card/Review → the system viewer launches the stored file (at the page where supported).

- [X] T008 [US2] Add an **Open** affordance to the card-editor citation list in `src/features/courses/CardCitations.tsx` (mirror `ReviewCitations`: build `resourceTarget(resource, locator)`, `openCitation(target)` on click, disabled when target is null — FR-008), so a stored source is openable from the editor as well as Review.
- [X] T009 [P] [US2] Unit test in `src/features/srs/citations/openTarget.test.ts` (extend) confirming a file-kind Resource **with** a `file_path` yields an openable target (e.g. pdf + `page=10` → `file://…#page=10`) and a `book`/file-less Resource yields `null` (Open stays disabled).

**Checkpoint**: citations to stored sources open; file-less Resources stay gracefully disabled.

---

## Phase 5: User Story 3 — Reclaim storage when a Resource is removed (Priority: P3)

**Goal**: deleting a Resource removes its stored file copy (no orphans).

**Independent Test**: attach a file, delete the Resource → the stored copy is gone; deleting a Resource whose copy is already missing still succeeds.

- [X] T010 [US3] In `src/features/resources/useResources.ts` `remove(id)`, after `deleteResource(db,id)` (DB cascade) call `sourceFiles.removeFiles(id)`; tolerate a removeFiles rejection (log, do not block the completed row delete — FR-009). (Same file as T006/T014 — sequential.)
- [X] T011 [US3] Component test in `src/features/resources/ResourcesRoute.test.tsx`: deleting a Resource calls the fake `SourceFiles.removeFiles` with the resource id (and the list still updates).

**Checkpoint**: deletes reclaim storage; no orphaned copies.

---

## Phase 6: User Story 4 — Organize the Resource registry by Domain (Priority: P3)

**Goal**: file a Resource under a Domain and filter the registry by it. **Independent of Phases 2/3/5** (schema + UI only; no file-store dependency).

**Independent Test**: assign a Resource to a Domain, filter the registry by that Domain → only matching Resources show.

- [X] T012 [US4] Create `src/db/migrations/m0005_resource_domain.ts` (additive): `ALTER TABLE resources ADD COLUMN domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL;` + `CREATE INDEX IF NOT EXISTS idx_resources_domain_id ON resources(domain_id);` and register it in `src/db/migrations/index.ts` (latest version → 5). **`ON DELETE SET NULL`** so deleting a Domain *unfiles* its Resources rather than failing the delete (analyze C1).
- [X] T013 [US4] Add `domain_id: z.string().nullable()` to `ResourceSchema` in `src/db/models/resource.ts`.
- [X] T014 [US4] In `src/db/repositories/resources.ts`: `registerResource`/`updateResource` accept optional `domainId` (→ `domain_id`); `listResources(db, vaultId, opts?: {domainId?})` adds `AND domain_id = ?` when provided (per [contracts/resource-data.md](./contracts/resource-data.md)). (Same file none-conflicting with hooks; sequential after T013.)
- [X] T015 [P] [US4] Repo tests in `src/db/repositories/resources.test.ts`: register-with-domain, update set/clear domain, `listResources` domain filter, and a lossless check (a pre-m0005 row reads `domain_id: null`).
- [X] T016 [P] [US4] Bump the version-pinned migration tests 4→5 (`src/db/migrate.test.ts`, `migrate.evolution.test.ts`, `migrate.lossless.test.ts`, `repositories/settings.test.ts`) and scope Feature 010's `src/db/migrate.srs.test.ts` self-heal/idempotent assertions so they still pass with latest=5 (research R9).
- [X] T017 [US4] In `src/features/resources/ResourceForm.tsx`, add a "Home domain" `<select>` (vault Domains + "— none —"), seeded from `domain_id` on edit, submitting `domainId` (set/clear). (Same file as T005 — sequential.)
- [X] T018 [US4] In `src/features/resources/ResourcesRoute.tsx` + `useResources.ts`, add a "Filter by domain" `<select>` driving `listResources(vaultId,{domainId})` so the registry shows only that Domain's Resources (SC-007).
- [X] T019 [P] [US4] Component test in `src/features/resources/ResourcesRoute.test.tsx`: set a Resource's home Domain on edit (persists), and the registry Domain filter narrows the list.

**Checkpoint**: the registry is fileable + filterable by Domain.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T020 Reconcile the PRD ([PRD-CIC-Platform.md](../../PRD-CIC-Platform.md)): document `resources.domain_id` (§8) and internalized-file storage in the app-data store (refine F10.8 — manual registration now stores a local copy); bump the version + changelog (Constitution V — PRD updated to reflect shipped model).
- [X] T021 Update the `<!-- SPECKIT … -->` block in [CLAUDE.md](../../CLAUDE.md): flip 011 from "planned" to "implemented" with the final test count + outcomes.
- [X] T022 Quality gate: `npx tsc --noEmit`, `npx vitest run`, `npx eslint .`, `npx vite build` — all clean.
- [ ] T023 Live `tauri dev` validation of [quickstart.md](./quickstart.md) scenarios A–H (the native copy/remove, the OS dialog, the opener deep-link, and the vault-stays-clean check) — the user's manual pass.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1: T001)** → no deps.
- **Foundational (P2: T002–T004)** → blocks **US1, US2, US3**. (Does **not** block US4.)
- **US1 (P3)** → after Foundational. **US2 (P4)** → after US1 (needs a stored `file_path`). **US3 (P5)** → after Foundational.
- **US4 (P6)** → independent of Foundational/US1–3 (schema + registry UI only); can run anytime after Setup.
- **Polish (P7)** → after all targeted stories.

### Same-file sequencing (no [P] among these)

- `useResources.ts`: T006 (US1) → T010 (US3) → T018 (US4 filter). 
- `ResourceForm.tsx`: T005 (US1) → T017 (US4 domain select).
- `ResourcesRoute.test.tsx`: T007 → T011 → T019 (additive; keep ordered).

### Parallel opportunities

- T003 ‖ T002 (different files; T003's calls target T002's commands but the contract is fixed).
- US4 (T012–T019) can proceed fully in parallel with US1–US3 (disjoint files except the shared form/route, which US4 appends to).
- Within US4: T015, T016, T019 are [P] (distinct test files) once their production deps land.

---

## Implementation Strategy

### MVP (User Story 1)

1. Phase 1 (Setup) → Phase 2 (Foundational: Rust commands + `SourceFiles` seam + DI) → Phase 3 (US1).
2. **STOP & VALIDATE**: pick a file → it internalizes → original untouched (quickstart A).

### Incremental delivery

- + US2 → citations open at their locator (quickstart B).
- + US3 → deletes reclaim storage (quickstart D).
- + US4 (independent) → file/filter the registry by Domain (quickstart F).
- Polish: PRD + CLAUDE.md + quality gate + full live quickstart A–H.

### Notes

- The native commands (T002) and the OS dialog are **not** unit-tested — they are the live `tauri dev` check (T023). Everything above them is tested behind the `SourceFiles` seam with a fake.
- Constitution guardrails to hold throughout: store **outside** the vault (T002 fixed base), copy-never-move, fully local, all-or-nothing import, no path traversal.
