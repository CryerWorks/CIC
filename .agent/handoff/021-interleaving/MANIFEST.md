# Handoff: 021-interleaving — Interleaving Scheduler (F6)

**Feature**: 021 | **Branch**: `021-interleaving` | **No AI — pure logic**

## What to build (headless scheduler + Dashboard tiles)

### T001: Migration m0012 — course_dependencies table
`src/db/migrations/m0012_course_dependencies.ts`: id, course_id FK, prereq_course_id FK. Unique(course_id, prereq_course_id).

### T002: Course dependency repo + tests
`src/db/repositories/courseDependencies.ts`: addDependency, removeDependency, getPrereqs, getDependents. Test file.

### T003: Interleaving scheduler
`src/features/interleaving/scheduler.ts`:
- `getDailyMix(db, vaultId)` — priority: sessions planned today > due reviews > cold courses. Interleave across domains.
- `getColdDomains(db, vaultId, days=7)` — domains with no session in N days
- `respectsPrereqs(db, courseId)` — all prereqs have ≥1 completed session

### T004: Scheduler tests
`src/features/interleaving/scheduler.test.ts` — verify mix ordering, domain interleaving, prereq respect, cold detection

### T005: Dashboard tiles
- "Today's Mix" tile (`src/features/dashboard/DailyMixTile.tsx`) — shows top 3-5 recommendations
- "Going Cold" tile (`src/features/dashboard/ColdTile.tsx`) — shows domains with no activity
- Wire into DashboardRoute + useDashboard

### T006: Settings
- Configurable cold threshold in settings KV (`interleaving.coldDays`, default 7)
- Settings UI section in `src/features/settings/`

### T007: Quality gates — test, lint, tsc

## Key: No AI, no vault writes, no new npm deps. Pure SQL + derived logic.
