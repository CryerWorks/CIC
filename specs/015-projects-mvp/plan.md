# Implementation Plan: Projects — Applied Practice (MVP)

**Branch**: `015-projects-mvp` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-projects-mvp/spec.md`

## Summary

A **Project** (PRD F11) is the applied-practice artifact that closes the knowledge→application gap: a concrete problem the learner solves using 1..N Milestones' worth of capability from a single Course. This MVP is **fully manual, no AI**. The learner authors a Project from the Course-detail screen; it materializes as a clean Markdown file in the vault (mandatory `cic-type: project` frontmatter = the machine/integration layer, plus a **freeform, domain-shaped body** seeded once from a template the app never re-clobbers); status moves `open → in-progress → complete | abandoned` under learner control; closing prompts a reflection from which the learner can **manually** spawn SRS cards; the dashboard surfaces active Projects per Domain; and the vault round-trips via rescan + a detach-or-delete-file removal flow.

**The pleasant surprise:** the entire Projects schema — `projects`, `project_milestones`, `project_resources`, and the nullable `sessions.project_id` / `cards.project_id` FKs — already shipped in `m0001_initial` (v1). So this feature is **almost all application code on an existing schema**, with one tiny additive migration (`m0008`) adding `projects.title` (the spec requires a human label distinct from the capability *sentence*, and the DB-only dashboard read-model must list Projects without touching the vault) plus two `project_id` indexes.

**The one genuinely new design** is the **Project document module** (`src/features/projects/doc/`) — it mirrors Feature 007's MOC module (render/parse/merge/frontmatter/filename/markers) but with the critical inversion: a Course MOC's body is *app-managed* (sections re-rendered every materialize), whereas a Project's body is **learner-owned** — the app renders it once from a template at creation and thereafter only ever rewrites the **frontmatter** (status/closed date), keeping the body verbatim. This makes Project merge *simpler* than MOC merge, not harder.

## Technical Context

**Language/Version**: TypeScript (strict) on React 19 + Vite; no `any`.

**Primary Dependencies**: All existing — `tauri-plugin-sql` (via the `src/db` adapters + `SqlExecutor` seam), `tauri-plugin-fs` (via the `VaultReader`/`VaultWriter` spine, `src/vault/`), `ts-fsrs` (via the `Scheduler` seam, `src/features/srs/fsrs/`). **No new dependency. No new native bridge.**

**Storage**:
- **SQLite** — additive migration `m0008_project_authoring` (schema 7 → 8): `ALTER TABLE projects ADD COLUMN title` + `idx_sessions_project_id` / `idx_cards_project_id`. Everything else (`projects`, `project_milestones`, `project_resources`, the FKs) already exists from v1.
- **Obsidian vault** (canonical) — each Project is a Markdown file under `Projects/` written exclusively through `VaultWriter` (atomic, never-clobber).

**Testing**: Vitest. Repo + migration + sync tests run `// @vitest-environment node` against the `NodeSqlExecutor` and (for sync) a real temp vault; component/hook tests run under jsdom via `renderApp`/`renderWithVault` test-support, with no jest-dom matchers.

**Target Platform**: Tauri desktop (Windows/macOS/Linux). Fully local, offline-capable.

**Project Type**: Desktop app (single-user, personal).

**Performance Goals**: Interactive; all Project queries are indexed (`idx_projects_course_id` exists; adding the `project_id` indexes covers the new dashboard + session-link reads). No N+1 in the dashboard read-model (one grouped query).

**Constraints**: Fully local — no network, no telemetry, **no AI** in this feature. The vault is sacred (Constitution I): only `VaultWriter`/`VaultReader` touch `.md`; freeform body never clobbered; delete is the sanctioned `deleteNote` exception, confirmed.

**Scale/Scope**: Personal scale (tens–hundreds of Projects per vault). Large *feature* surface (DB repo + pure document module + sync layer + 4 UI surfaces + dashboard tile), so delivery is phased by user story (US1 → US2 → US3), each independently testable.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | How this feature complies |
|---|---|---|
| **I. Vault Sacred (NON-NEGOTIABLE)** | ✅ PASS | Project `.md` writes go **only** through `VaultWriter` (atomic temp→rename, never-clobber via the `vault_writes` fingerprint log). The learner-owned freeform body is **never** re-rendered after creation — the app touches only the marker/frontmatter region (an even stronger guarantee than the MOC). Deletion uses the sanctioned `deleteNote` with the same drift guard + a confirmed "delete anyway"; detach strips `cic-*` keys and leaves the file. Files are clean, human-readable Markdown. |
| **II. AI Vendor-Agnostic (NON-NEGOTIABLE)** | ✅ PASS (N/A) | This MVP contains **no AI**. No `Provider` calls, no vendor SDK, no `src/ai/` touch. AI seeding of Projects (F11.4) is explicitly deferred to Phase 3.5. |
| **III. Preserve Desirable Difficulty (NON-NEGOTIABLE)** | ✅ PASS | Nothing auto-marks a Project `complete` — every status transition is learner-driven. Card-spawn on close is **manual-approve only** (the learner authors/selects each card); no auto-spawn. No grading/scoring/correctness assessment of the work product (FR-013). `abandoned` is framed as neutral, never failure. |
| **IV. Interface-First, Deep Modules** | ✅ PASS | Built entirely on existing spines (`VaultReader`/`VaultWriter`, `SqlExecutor`, `Scheduler`) — features depend on interfaces, not adapters. The new Project document module is a **pure** module (string render/parse/merge, no IO) consumed by a thin sync layer, mirroring the established 007 split. No new spine interface is required; no leaky abstraction introduced. |
| **V. Spec-Driven Development** | ✅ PASS | Spec written and validated (zero clarifications); full Phase 1 doc set produced here (research + data-model + contracts + quickstart); PRD §8 reconciliation (the `projects.title` delta) noted for the implement-phase polish; mandatory end-of-feature walkthrough will close the feature. |

**No violations. Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/015-projects-mvp/
├── plan.md              # This file
├── research.md          # Phase 0 — key decisions + rationale
├── data-model.md        # Phase 1 — entities, the m0008 delta, frontmatter schema, status lifecycle
├── quickstart.md        # Phase 1 — live `tauri dev` walkthrough (A–…)
├── contracts/           # Phase 1 — module/interface contracts
│   ├── project-document.md     # the pure doc module (render/parse/merge/templates/frontmatter)
│   ├── projects-repository.md  # SQLite repo (CRUD, links, status, close+spawn)
│   ├── project-sync.md         # materialize / rescan / remove (detach|deleteFile)
│   └── ui-projects.md          # CourseDetail Projects section, forms, dialogs, dashboard tile
├── checklists/
│   └── requirements.md  # spec quality checklist (done)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/
├── db/
│   ├── migrations/
│   │   ├── m0008_project_authoring.ts   # NEW — title + project_id indexes (7→8)
│   │   └── index.ts                     # register m0008
│   ├── models/
│   │   └── project.ts                   # + title field on ProjectSchema
│   ├── repositories/
│   │   ├── projects.ts                  # NEW — createProject, get/list (course + active),
│   │   │                                #        setProjectMilestones, setProjectResources,
│   │   │                                #        setProjectStatus/markInProgress, closeProject,
│   │   │                                #        upsertImportedProject, deleteProject
│   │   ├── projects.test.ts             # NEW
│   │   ├── cards.ts                     # createCard gains optional projectId
│   │   ├── sessions.ts                  # planSession gains optional projectId (+ flips open→in-progress);
│   │   │                                #        listSessionsForProject (for "touched")
│   │   ├── dashboard.ts                 # + active-Projects-per-Domain in the summary read-model
│   │   ├── migrate.test.ts              # bump 7→8
│   │   ├── migrate.evolution.test.ts    # bump 7→8
│   │   ├── migrate.lossless.test.ts     # bump 7→8 (new latest)
│   │   └── settings.test.ts             # bump 7→8
│   └── …
├── features/
│   └── projects/                        # NEW feature module (mirrors features/courses/)
│       ├── doc/                         # PURE document module (mirrors courses/moc/)
│       │   ├── markers.ts               # cic:project marker contract (frontmatter-only managed)
│       │   ├── model.ts                 # ProjectDocModel, ParsedProject, ProjectParseError
│       │   ├── frontmatter.ts           # zod ProjectFrontmatterSchema (cic-type: project, cic-id, …)
│       │   ├── templates.ts             # 3 seed bodies: math/proof, cs/implement, freeform
│       │   ├── render.ts                # renderProjectDoc(model) — full file at creation
│       │   ├── parse.ts                 # parseProjectFrontmatter(raw) — read-back
│       │   ├── merge.ts                 # swap frontmatter, keep body verbatim; appendReflection
│       │   ├── filename.ts              # slug under Projects/
│       │   └── index.ts
│       ├── sync/
│       │   ├── deps.ts                  # ProjectSyncDeps (db + vault)
│       │   ├── materialize.ts           # materializeProject (create | update-frontmatter | close)
│       │   ├── rescan.ts                # rescanProjects (discriminate by cic-type: project, upsert)
│       │   └── delete.ts                # removeProject (detach | deleteFile)
│       ├── useProjects.ts               # hook: list/create/edit/status/close/remove + materialize/rescan
│       ├── ProjectsSection.tsx          # the Projects list rendered inside CourseDetailRoute
│       ├── ProjectForm.tsx              # create/edit: title, ≥1 milestone, capability, template, framing, resources
│       ├── CloseProjectDialog.tsx       # complete|abandoned + reflection + manual card-spawn rows
│       ├── DeleteProjectDialog.tsx      # detach | deleteFile (+ "delete anyway" on drift)
│       └── *.test.tsx / *.test.ts
└── features/courses/
    ├── CourseDetailRoute.tsx            # mount <ProjectsSection courseId=… />
    └── SessionPlanner.tsx               # optional Project picker (course's open/in-progress projects)
```

**Structure Decision**: New `src/features/projects/` mirrors the proven `src/features/courses/` layout (a pure `doc/` module + a `sync/` layer + a hook + screens + dialogs). The DB work is additive on the existing schema (one column, two indexes, a new repository). **No `src-tauri/` change** this feature — unlike 014, there is no new native capability; the vault and SQLite bridges already cover everything.

## Implementation Phasing (maps to spec user stories)

- **Phase A — Setup/Foundational**: `m0008` migration + version-test bumps; `project.ts` model `+ title`; the pure `doc/` module (render/parse/merge/templates/frontmatter/filename) with unit tests; the `projects.ts` repository core (create + links + get/list) with node tests; `createCard` gains `projectId`.
- **Phase B — US1 (P1) Author a Project**: `materializeProject` (create) + `rescanProjects` import path partial; `useProjects` create flow; `ProjectsSection` + `ProjectForm` on Course-detail; round-trip test (create → file written → listed).
- **Phase C — US2 (P2) Work & close**: session↔project link in `planSession` + `SessionPlanner` picker + open→in-progress flip; `closeProject` (+ frontmatter swap + reflection append) ; `CloseProjectDialog` with manual card-spawn (reusing `createCard` w/ `projectId`).
- **Phase D — US3 (P3) Round-trip + dashboard + delete**: full `rescanProjects` (upsert-by-id, external-edit reflect), dashboard active-Projects-per-Domain tile, `removeProject` (detach|deleteFile) + `DeleteProjectDialog`.
- **Phase E — Polish**: PRD §8 reconcile (add `projects.title`; annotate F11 MVP shipped), CLAUDE.md, full gate (tsc + ESLint + `vite build` + `cargo check` unchanged-but-verified + Vitest), quickstart authored. Live `tauri dev` quickstart is the user's check.

## Key design decisions (detail in research.md)

1. **`projects.title` is added** (the one migration). `capability` is a *sentence* ("what completing this proves"); a Project still needs a short label for lists and the **DB-only** dashboard read-model. Mirrors `courses.title`. PRD §8 reconciled.
2. **Body is learner-owned; only frontmatter is app-managed.** The inverse of the MOC. `materializeProject` renders the full file once at creation, then on any later change rewrites **frontmatter only**, preserving the body byte-for-byte. This is the strongest possible reading of "never clobber" and keeps merge trivial.
3. **Reflection persistence on close is an additive body append**, under a `## Reflection (closed YYYY-MM-DD)` heading — user-authored prose written once, never overwritten — kept deliberately simple to avoid body-merge complexity.
4. **Card-spawn reuses `createCard`** (extended with an optional `projectId`); the close dialog presents editable front/back rows the learner explicitly confirms — never auto-generated, never auto-scheduled beyond normal new-card behavior.
5. **Session link flips status on plan.** A planned session targeting a Project counts as "touching" it → `open → in-progress`; manual advance is also available.
6. **Vault scoping is transitive** (project → course → domain → vault); no `projects.vault_id`. Active-vault queries join through, exactly like courses/sessions/cards.
