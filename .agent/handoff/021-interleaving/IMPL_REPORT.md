# Implementation Report: 021-interleaving (F6)

**Date**: 2026-06-15  
**Implementer**: DeepSeek V4 Flash (frontier-implementer)

## Diff Summary

| Metric | Count |
|--------|-------|
| Files created | 10 |
| Files modified | 10 |
| Lines added | ~850 |

### Created files

| File | Purpose |
|------|---------|
| `src/db/migrations/m0012_course_dependencies.ts` | T001: course_dependencies table + indexes |
| `src/db/repositories/courseDependencies.ts` | T002: addDependency, removeDependency, getPrereqs, getDependents |
| `src/db/repositories/courseDependencies.test.ts` | T002: 5 tests for dependency CRUD |
| `src/features/interleaving/scheduler.ts` | T003: getDailyMix, getColdDomains, respectsPrereqs, getColdThreshold |
| `src/features/interleaving/scheduler.test.ts` | T004: 21 tests for scheduler logic |
| `src/features/dashboard/DailyMixTile.tsx` | T005: "Today's Mix" dashboard tile |
| `src/features/dashboard/ColdTile.tsx` | T005: "Going Cold" dashboard tile |
| `src/features/settings/InterleavingSection.tsx` | T006: Cold threshold settings UI |

### Modified files

| File | Change |
|------|--------|
| `src/db/migrations/index.ts` | Register m0012 migration |
| `src/db/index.ts` | Export courseDependencies repo |
| `src/db/migrate.test.ts` | Bump version from 11→12, add course_dependencies to ALL_TABLES |
| `src/db/migrate.evolution.test.ts` | Bump dummy probe from v12→v13 |
| `src/db/migrate.lossless.test.ts` | Bump dummy from v12→v13 |
| `src/db/migrations/m0009.test.ts` | Bump version check 11→12 |
| `src/db/migrations/m0010.test.ts` | Bump version check 11→12 |
| `src/db/repositories/settings.test.ts` | Bump version check 11→12 |
| `src/features/dashboard/useDashboard.ts` | Load dailyMix + coldDomains from scheduler |
| `src/features/dashboard/DashboardRoute.tsx` | Import + render DailyMixTile + ColdTile in new Interleaving panel |
| `src/app/routes/settings/SettingsRoute.tsx` | Import + render InterleavingSection |
| `src/features/dashboard/DashboardRoute.test.tsx` | Fix findAllByText for Zoology (appears in both allocation + cold tile) |

## Gate Results

| Gate | Result |
|------|--------|
| All tests pass | ✅ 133 files, 795 tests |
| Linter passes | ✅ 0 errors |
| Type checks pass | ✅ tsc --noEmit, 0 errors |
| No debug artifacts | ✅ no console.log, print, dbg! |
| No TODO/FIXME/HACK | ✅ clean |
| Public APIs typed | ✅ all exported functions have explicit return types |

## Design Decisions

### 1. Separate interleaving load from core dashboard load
The interleaving data (dailyMix, coldDomains) is loaded in a second `Promise.all` **after** the core dashboard data, with `.catch()` handlers. This ensures a scheduler error never blocks the core summary from rendering (Constitution III: start from real data).

### 2. Cold domain detection uses sessions only
`getColdDomains` checks the `sessions` table's `completed_at` for recent activity. Reviews (SRS) are intentionally excluded — the cold signal nudges the learner to **study** a domain, not just review cards. This aligns with US2's "no session in N days" requirement.

### 3. Interleaving via round-robin
The `interleaveByDomain` helper groups recommendations by domain and alternates between them, guaranteeing no two adjacent items share a domain (SC-002). Falls back to insertion order for single-domain lists.

### 4. Prereq check is per-course, per-call
`respectsPrereqs` runs one SQL query per declared prerequisite. For typical usage (1-3 prereqs per course) this is acceptable; an N+1 optimization could batch-check all candidate courses in one query if the mix grows large.

### 5. Cold threshold settings live in the existing KV store
`interleaving.coldDays` uses the same `settings` table (m0002) as `vault.path` and `srs.dailyNewCap`. No new schema for feature toggles.

## Limitations / Known Issues

- **Cold domain detection**: Currently only checks `sessions.completed_at`. Future iterations could also consider `sessions.date` for planned sessions and `reviews.reviewed_at` for SRS activity.
- **No persistent mix logs**: The daily mix is recomputed on every dashboard load. For historical tracking, a future version could cache the day's mix in a new table.
- **Interleaving is heuristic, not ML**: The v1 prioritization (planned > due-review > cold) with round-robin domain alternation is a simple heuristic. No AI-driven selection.
