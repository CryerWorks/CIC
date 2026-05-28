# Implementation Plan: Command Center Dashboard (real data)

**Branch**: `008-dashboard-real-data` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-dashboard-real-data/spec.md`

## Summary

Replace the placeholder Dashboard with a real landing screen driven by the data that exists today — the Domain → Course → Milestone hierarchy in SQLite plus vault-connection state. The screen shows live totals, overall milestone progress (todo/in-progress/done), per-Domain allocation (with each Domain's color), and a Domain-grouped Course list that links into the Courses screen. Data comes from a **read-only aggregate read-model** (`getDashboardSummary`) computed with a handful of `GROUP BY` queries — no per-course N+1, no new schema. The war-room retention tiles (streak, today's protocol, activity heatmap, recent sessions, due cards) are rendered as clearly-labeled "arrives in Phase 2" shells with **no fabricated numbers** (Constitution III). A brand-new user sees onboarding instead of zeroed tiles.

## Technical Context

**Language/Version**: TypeScript (strict), React 19 (function components + hooks).

**Primary Dependencies**: existing only — React Router, the 002 component kit (`Panel`, `StatCell`, `Tag`, `Callout`), Tailwind (Obsidian theme), the 003 SQLite layer (`SqlExecutor` + repositories), the 006 `VaultProvider` (`useVaultState`). **No new runtime dependencies.**

**Storage**: SQLite, **read-only**. Aggregates over existing `domains` / `courses` / `milestones` tables. **No new schema, no migration.**

**Testing**: Vitest. Repo aggregate fns unit-tested under `// @vitest-environment node` against `node:sqlite` (`NodeSqlExecutor`); the hook/screen via component tests (jsdom) reusing `renderWithVault` + `makeReadyDb`.

**Target Platform**: Tauri desktop (Windows/macOS/Linux); logic is runtime-agnostic and Tauri-free in tests.

**Project Type**: Desktop app — single React + TS frontend over a Tauri shell.

**Performance Goals**: Dashboard usable within ~1s of open (SC-001). The summary is a fixed, small number of aggregate queries (≈4) regardless of course count — **no N+1**.

**Constraints**: Fully local; read-only (no vault writes, no mutations); must render correctly for empty/edge data (0 milestones, 0 courses, empty DB) with no `NaN`; must never fabricate retention data or auto-mark anything "learned" (Constitution III).

**Scale/Scope**: Single local user; realistically tens to low-hundreds of Courses/Milestones. One screen, one read-model module, one hook, a few presentational tiles.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I. Vault Canonical & Sacred** | ✅ Read-only feature. Touches **no `.md` files** — "MOC present?" comes from `course.moc_path` (SQLite), not from reading the vault. Reads vault *connection state* via `useVaultState`, never the filesystem. No `VaultWriter`/`VaultReader` use. |
| **II. AI Vendor-Agnostic Tutor** | ✅ No AI in this feature. No vendor imports. |
| **III. Preserve Desirable Difficulty** | ✅ **Central gate.** FR-006/FR-007 + SC-004 forbid fabricated streaks/activity and any auto-"learned" marking. Deferred retention tiles are labeled placeholders with no numeric values. Progress shown is a literal count of user-set milestone statuses — never inferred or auto-advanced. |
| **IV. Interface-First, Deep Modules** | ✅ Dashboard reads through the **repository layer** (`getDashboardSummary` in `src/db/repositories/dashboard.ts`) over the `SqlExecutor` seam — never the Tauri SQL plugin directly. Feature depends on the repo fn + `useDb`/`useVaultState` interfaces. Read-model is additive; no new spine surface. |
| **V. Spec-Driven Development** | ✅ Spec written + validated; full Phase 1 doc set produced here; PRD §F8 is the source. Walkthrough at the end. |

**Result: PASS. No violations → no Complexity Tracking entries.**

## Project Structure

### Documentation (this feature)

```text
specs/008-dashboard-real-data/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (R1–R7)
├── data-model.md        # Phase 1 — the DashboardSummary read-model + aggregate queries
├── quickstart.md        # Phase 1 — manual scenarios A–F
├── contracts/
│   ├── dashboard-repo.md # getDashboardSummary contract + test obligations
│   └── dashboard-ui.md   # useDashboard hook + DashboardRoute rendering contract
└── checklists/
    └── requirements.md   # (from /speckit-specify)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── repositories/
│       ├── dashboard.ts          # NEW — read-only aggregate read-model (getDashboardSummary)
│       └── dashboard.test.ts     # NEW — node:sqlite aggregate tests
├── features/
│   └── dashboard/                # NEW — the F8 feature home (mirrors features/courses/)
│       ├── useDashboard.ts       # hook: load summary + courses + vault state
│       ├── DashboardRoute.tsx    # the screen (moved here from app/routes, like CoursesRoute)
│       ├── DashboardRoute.test.tsx # component tests (vault banner + data tiles + empty + deferred)
│       ├── MilestoneProgress.tsx # small presentational status bar (todo/in-progress/done)
│       ├── DomainAllocation.tsx  # per-domain allocation tile
│       └── DeferredTiles.tsx     # labeled "arrives in Phase 2" retention shells
└── app/
    ├── router.tsx                # import DashboardRoute from features/dashboard (was app/routes)
    └── routes/
        ├── DashboardRoute.tsx    # DELETED (moved into features/dashboard)
        └── DashboardRoute.test.tsx # DELETED (moved/rewritten under features/dashboard)
```

**Structure Decision**: Follow the **Feature 007 precedent** — the screen + its hook + presentational pieces live under `src/features/dashboard/`, and the thin router wires it (the old `src/app/routes/DashboardRoute.tsx` placeholder is removed, exactly as the Courses placeholder was). The aggregate **read-model** lives in the SQLite repository layer (`src/db/repositories/dashboard.ts`) — the deep module behind the `SqlExecutor` seam — so the feature depends on a typed repo function, not on SQL or the plugin (Constitution IV). `Campaign`/`Domain`/`Course`/`Milestone` models + repos are reused as-is.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
