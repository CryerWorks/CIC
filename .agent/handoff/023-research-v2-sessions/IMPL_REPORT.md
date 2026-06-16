# Implementation Report — 023: Research Agent V2 (Session Structure)

## Diff Summary

| File | Action | Lines |
|------|--------|-------|
| `src/ai/features/blueprint/types.ts` | MODIFY | +46 — Added SessionSource, SessionCardSeed, SessionSeed, ProjectSeed interfaces |
| `src/ai/features/blueprint/validator.ts` | MODIFY | +59 — Zod schemas for new types, updated MilestoneSeedSchema, post-validation for session/project index bounds |
| `src/db/migrations/m0014_session_sources.ts` | NEW | +18 — session_sources table with FK to sessions + resources, CHECK constraint on type |
| `src/db/migrations/index.ts` | MODIFY | +2 — Registered m0014SessionSources |
| `src/ai/prompts/research.ts` | MODIFY | +35 — Updated system prompt with V2 output format (sessions, per-source cards, projects) |
| `src/ai/features/research/types.ts` | MODIFY | +7 — Re-export SessionSeed, ProjectSeed from blueprint types |
| `src/ai/features/research/engine.ts` | — | No changes needed (validator handles new structure) |
| `src/ai/features/blueprint/materializer.ts` | MODIFY | +149 — Added materializeSessions, materializeCards (inlined), materializeProjects; updated materializeBlueprint to emit sessionCount+projectCount |
| `src/features/research/CampaignReview.tsx` | MODIFY | +96 — Shows sessions + projects per milestone in review UI; updated summary and confirm dialog |
| `src/db/migrate.test.ts` | MODIFY | +9 — Updated table list (added session_sources), version 13→14 |
| `src/db/migrate.evolution.test.ts` | MODIFY | +24 — Updated probe version 14→15, assertions 13→14 |
| `src/db/migrate.lossless.test.ts` | MODIFY | +10 — Updated probe version 14→15, assertions 13→14 |
| `src/db/migrations/m0009.test.ts` | MODIFY | +2 — Updated expected user_version 13→14 |
| `src/db/migrations/m0010.test.ts` | MODIFY | +2 — Updated expected user_version 13→14 |
| `src/db/repositories/settings.test.ts` | MODIFY | +2 — Updated expected version 13→14 |

**Total**: 14 files changed, ~419 lines added, 42 lines removed

## Gate Results

| Gate | Result |
|------|--------|
| All tests pass (815) | ✅ PASS |
| ESLint (0 errors) | ✅ PASS |
| `npx tsc --noEmit` (0 errors) | ✅ PASS |
| No debug artifacts | ✅ PASS |
| No TODO/FIXME/HACK left | ✅ PASS |
| All public APIs have explicit type signatures | ✅ PASS |
| No new npm deps | ✅ PASS |
| No Rust changes | ✅ PASS |

## Design Decisions

### 1. Backward Compatibility
- `sessions[]` and `projects[]` are **optional** fields on MilestoneSeed with default `[]`
- Old AI responses (V1 format without sessions/projects) validate successfully through the updated Zod schema
- `MaterializeCourseResult` added `sessionCount` and `projectCount` fields without breaking existing consumers
- The engine code required **zero changes** — validation flows through unchanged

### 2. Card Creation Strategy
- Per-source cards (from `session.cards[]`) are created via the existing `createCard` with blank backs (scaffold-only)
- `card_resources` linking is **deferred to v2.1** — card_resources requires a resource_id from the `resources` table, which doesn't exist for URL-based sources in v2.0
- The session_sources table has a nullable `resource_id` FK for future linking (v2.1)

### 3. Materialization Flow
- Sessions are created before projects within each milestone
- Session order within a milestone uses array index as `order_index`
- Projects link to milestones via `project_milestones` table (existing schema)
- `requiredSessionIndices` from ProjectSeed is advisory in v2.0 — stored in the AI JSON but not enforced in the DB schema (v2.1 will add session-level gating)

### 4. Migration Tests
- All migration tests updated to expect `user_version = 14` (was 13)
- Probe versions in evolution/lossless tests bumped to 15 (past the new m0014)

### 5. Session Objective Mapping
- The `sessions` table has an `objective` field (no separate `title`). The SessionSeed has both `title` and `objective`. We store `objective` in the session row; the `title` is display-only in the review UI and would be rendered in the MOC in a future release.

### 6. Prompt Design
- The AI is instructed to emit per-source cards with `sourceIndex` pointing to the session's sources array
- The system prompt now explicitly asks for 2-5 sessions per milestone and 1-2 projects per milestone
- The JSON example shows the full V2 structure with nested sessions, sources, cards, and projects

## Limitations / Known Issues
- **No resource ingestion in v2.0**: session_sources.resource_id is always null; cards are not linked to resources
- **requiredSessionIndices is advisory**: The DB schema doesn't enforce session gating on projects — this will arrive in v2.1
- **No MOC rendering for sessions**: The MOC document currently only shows milestones; session/project rendering in the vault file is deferred to v2.1
- **No `sessions.title` column**: The `sessions` table only has `objective`, so session titles are not persisted independently
