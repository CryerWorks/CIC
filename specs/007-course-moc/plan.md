# Implementation Plan: Course Authoring & MOC Materialization

**Branch**: `007-course-moc` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-course-moc/spec.md`

## Summary

Turn the existing Course/Campaign/Milestone data model (003) into a real authoring experience that materializes each Course as an Obsidian **MOC** Markdown file via the vault layer (005/006), and reads MOC edits back on app open / manual rescan. The work splits into three layers: (1) a **pure MOC document module** (`src/features/courses/moc/`) that renders, merges, and parses the locked v0.7 MOC body — the only place that knows the marker contract, fully unit-tested with no I/O; (2) a **sync layer** (`src/features/courses/sync/`) that composes the `src/vault` reader/writer with the `src/db` repositories to materialize a Course and to rescan/reconcile the vault; (3) the **Courses screen** (hook + form + milestones editor, mirroring the Domains pattern from 004). The vault's existing atomic, never-clobber `VaultWriter` is the sole write path; within-file user regions are protected by marker-scoped merging. No new SQLite schema — only additive repository functions.

## Technical Context

**Language/Version**: TypeScript 5.x (strict; no `any`)

**Primary Dependencies**: React 19, React Router v7 (declarative `<Routes>`), zod (frontmatter + input validation), Tailwind. Internal spines: `src/vault` (005 — `VaultReader`/`VaultWriter`, `gray-matter` frontmatter behind the seam) and `src/db` (003 — models, repositories, generic query helpers). **No new runtime dependencies.**

**Storage**: SQLite (tracking state — Course/Campaign/Milestone rows, `vault_writes` conflict log) + the Obsidian vault (canonical Markdown MOCs). No schema migration required.

**Testing**: Vitest. Pure MOC module → exhaustive unit tests (render/merge/parse/filename round-trips). Sync layer → integration tests over `node:fs` temp vault + `node:sqlite` (the established pattern from 003/005). UI → `@testing-library/react` with injected fakes (no jsdom Tauri).

**Target Platform**: Tauri desktop webview (Windows/macOS/Linux).

**Project Type**: Desktop app — single project under `src/`.

**Performance Goals**: A Course save materializes its MOC within ~2s (SC-001, dominated by a single atomic file write). A full rescan of a personal-scale vault (tens–low hundreds of MOCs) completes without perceptible UI stall.

**Constraints**: Fully local/offline. Never clobber user content (file-level drift detection + within-file marker-scoped merge). MOCs must render in plain Obsidian with **no plugin** (no Dataview). Never delete a vault file.

**Scale/Scope**: Personal single-user. Tens to low-hundreds of Courses/MOCs; a handful of Milestones per Course.

## Constitution Check

*GATE: evaluated against Constitution v1.1.0. Must pass before Phase 0; re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I. Vault Canonical & Sacred (NON-NEGOTIABLE)** | ✅ **Core of this feature.** Every `.md` write goes through the single `VaultWriter` (atomic temp→rename, never-clobber). Within-file user regions (`## Reflections`, any prose outside `<!-- cic:* -->` markers) are preserved by marker-scoped merge. Read-back never overwrites on drift — it surfaces. The app never deletes a vault file (Course deletion drops only the SQLite row). MOCs are clean, plugin-free Markdown. **One refinement to flag:** the locked v0.7 template shows `## Capability` without markers; for safe round-trip we wrap it in `<!-- cic:capability -->` markers, making *all* app-managed sections uniformly marker-delimited (see research R2). This is spirit-compliant (the PRD already states app-managed sections are marker-delimited) and is proposed as a PRD-template clarification. |
| **II. AI Vendor-Agnostic Tutor (NON-NEGOTIABLE)** | ✅ No AI in this feature. No provider/adapter code; no vendor imports. |
| **III. Preserve Desirable Difficulty (NON-NEGOTIABLE)** | ✅ Milestone status is user-set only; nothing is auto-marked "done". Read-back reflects the user's own edits — it never auto-advances learning state. No retrieval/spacing surface is touched. |
| **IV. Interface-First, Deep Modules (Pocock)** | ✅ The MOC document module is a pure deep module behind thin functions (render/merge/parse), imported by the sync layer; no I/O leaks into it. Persistence stays in the `src/db` repository spine (additive functions, exported from `db/index.ts`). The UI depends on a `useCourses` hook, not on the vault/db internals. Vendor SDKs remain confined to existing adapters. |
| **V. Spec-Driven Development** | ✅ Spec + full Phase-1 doc set produced. Data-integrity surfaces (MOC render/merge/parse, filename uniqueness, sync upsert/reconcile, never-clobber interaction) get unit/integration tests. End-of-feature walkthrough will follow implementation. |

**Result: PASS.** No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-course-moc/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (marker contract, merge strategy, identity, import)
├── data-model.md        # Phase 1 — entities + MOC frontmatter/body schema
├── quickstart.md        # Phase 1 — runtime (tauri dev) verification script
├── contracts/           # Phase 1 — module/function contracts
│   ├── moc-document.md       # pure render/merge/parse/filename API
│   ├── course-repos.md       # additive db repository functions
│   └── course-sync.md        # materialize + rescan orchestration API
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/
├── features/
│   └── courses/                  # Feature 007 home (CLAUDE.md target structure: F1 authoring)
│       ├── moc/                  # PURE document logic — no I/O, exhaustively unit-tested
│       │   ├── markers.ts        # marker constants + canonical app-managed section order
│       │   ├── frontmatter.ts    # MocCourseFrontmatter zod schema (cic-type/cic-id/title/domain/campaign)
│       │   ├── milestoneLine.ts  # render + parse a single milestone line (checkbox + id/status comment)
│       │   ├── render.ts         # buildFrontmatter(model) + renderMocBody(model) for a fresh file
│       │   ├── merge.ts          # mergeMocBody(existingBody, model) — replace inside markers, keep the rest
│       │   ├── parse.ts          # parseMocBody(body) → { capability, milestones } | MocParseError
│       │   ├── filename.ts       # mocRelPathFor(title, taken[]) — slug + collision suffix
│       │   ├── model.ts          # MocModel (the render/merge/parse input shape) + types
│       │   └── index.ts          # barrel (pure surface)
│       ├── sync/                 # orchestration: composes src/vault + src/db + moc/
│       │   ├── materialize.ts    # materializeCourse(deps, courseId) → MaterializeResult
│       │   └── rescan.ts         # rescanCourses(deps) → RescanReport (import/update/skip per file)
│       ├── useCourses.ts         # screen state hook (list grouped by Domain; create/edit; trigger materialize)
│       ├── CourseForm.tsx        # title + domain + optional campaign + capability
│       ├── MilestonesEditor.tsx  # add / edit / reorder / retire milestones
│       ├── CoursesRoute.tsx      # the screen (replaces the placeholder); gates on vault-ready
│       └── *.test.ts(x)          # co-located tests
├── db/
│   ├── repositories/
│   │   ├── courses.ts            # + updateCourse, listCourses, getCourseByMocPath, upsertCourseRow
│   │   ├── milestones.ts         # + updateMilestone, deleteMilestone, syncCourseMilestones
│   │   └── campaigns.ts          # NEW — listCampaignsByDomain, createCampaign, getCampaign
│   └── index.ts                  # + export ./repositories/campaigns
└── app/
    ├── router.tsx                # import CoursesRoute from features/courses (drop the placeholder)
    └── navigation.ts             # Courses → implemented: true
```

**Structure Decision**: The feature lives under **`src/features/courses/`**, matching the CLAUDE.md target structure (which names `features/courses/` as the home for F1 authoring + F10 generation). This intentionally differs from Feature 004, which kept Domains UI under `src/app/routes/domains/` — Courses is a larger, multi-layer feature (pure document logic + sync orchestration + UI), so cohesion under `features/` wins. Persistence stays in the **`src/db` repository spine** (additive, exported from `db/index.ts`) because Course/Campaign/Milestone are core hierarchy. The route component is imported into `app/router.tsx`, replacing the current placeholder.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
