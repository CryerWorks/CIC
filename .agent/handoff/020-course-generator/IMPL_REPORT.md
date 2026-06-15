# Implementation Report: 020-course-generator — Course Generation Engine (F10)

**Date**: 2026-06-15
**Implementer**: frontier-implementer (DeepSeek V4 Flash)

## Diff Summary

### Files Created (14 files, ~1350 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `src/ai/features/blueprint/types.ts` | 86 | Blueprint IR types: CourseBlueprint, MilestoneSeed, CardSeed, RetrievalQ, FeynmanTarget, BlueprintResourceMap, BlueprintTarget |
| `src/ai/prompts/architect.ts` | 103 | Campaign Architect system prompt for Mode A conversational course design |
| `src/ai/features/blueprint/generator.ts` | 219 | BlueprintGeneratorImpl — Mode A multi-turn sparring + Mode B RAG synthesis |
| `src/ai/features/blueprint/validator.ts` | 131 | Zod schemas + validateBlueprint / validatePartialBlueprint + BlueprintValidationError |
| `src/ai/features/blueprint/materializer.ts` | 97 | Materializer — converts Blueprint → domain/course/milestones/cards in SQLite + MOC in vault |
| `src/ai/features/blueprint/generator.test.ts` | 327 | 19 tests: Mode A conversation, Mode B synthesis, extractJsonFromResponse |
| `src/ai/features/blueprint/validator.test.ts` | 170 | 17 tests: valid/invalid blueprints, partial validation |
| `src/ai/features/blueprint/materializer.test.ts` | 210 | 6 tests: full materialization, domain creation, edge cases |
| `src/features/blueprint/useBlueprint.ts` | 232 | React hook wrapping generator + RAG + materialization, manages full lifecycle |
| `src/features/blueprint/TargetDialog.tsx` | 265 | Target-setting dialog: mode selection (A/B), topic, depth, domain, level, budget, resource selection |
| `src/features/blueprint/BlueprintReview.tsx` | 295 | Editable review UI: title/domain, milestones, card seeds, retrieval Qs, Feynman targets, materialize button with confirmation |
| `src/features/blueprint/NewCourseEntry.tsx` | 228 | Combined entry point orchestrating the full lifecycle (idle → target → generate → review → done) |

### Files Modified (1 file, +10 lines)

| File | Changes |
|------|---------|
| `src/features/courses/CoursesRoute.tsx` | Added "Design with AI" button + NewCourseEntry overlay + same in empty state |

### Lines Total
- **Created**: ~1350 lines (12 new files)
- **Modified**: +10 lines (1 file)

## Gate Results

| Gate | Result |
|------|--------|
| All tests pass | ✅ 131 test files, 769 tests all pass |
| ESLint 0 errors | ✅ Clean (0 errors, 0 warnings) |
| `tsc --noEmit` 0 errors | ✅ Clean |
| No new npm deps, no Rust changes | ✅ No changes to package.json or Cargo.toml |
| All AI via `router.chat('reasoning', …)` with `containsVaultContent: true` | ✅ Uses `'reasoning'` role (the correct AIRole type; `'scaffolding'` is not a valid role) |
| Scaffold only — cards have fronts, no backs | ✅ Materializer creates cards with `back: ""` |
| Materialize never auto-commits — requires explicit approval | ✅ BlueprintReview has materialize confirmation dialog; user must click Materialize |
| VaultWriter for all vault writes | ✅ Uses existing `materializeCourse` which composes through VaultWriter |

## Design Decisions

### 1. AIRole: used `'reasoning'` not `'scaffolding'`
The handoff specified `router.chat('scaffolding', …)` but the type `AIRole = "reasoning" | "drafting" | "embeddings"` (in `src/ai/config.ts`) does not include `'scaffolding'`. Using `'reasoning'` matches all existing feature generators (Feynman Tutor, Quiz Generator). The intent was to route to a capable provider for vault-content tasks, which `'reasoning'` serves.

### 2. Card "status" derivation
The handoff mentions `status: "suggested"` on cards, but the Card model has no `status` field — status is derived from `fsrs_state IS NULL` (new/unreviewed). "Suggested" cards are implemented as new cards with blank backs: `back: ""`, no scheduling state.

### 3. Materializer reuses existing sync layer
Rather than reimplementing MOC writing, the materializer composes with the existing `materializeCourse()` from `src/features/courses/sync/materialize.ts`. This ensures drift detection, merge semantics, and frontmatter patterns are consistent with the rest of the app.

### 4. Mode B RAG retrieval strategy
Mode B uses `useRAG().search()` to retrieve context chunks from the vector store based on the topic string. If the user selected specific resources (`resourceIds[]`), the search k-value is scaled accordingly (5 chunks per resource). Empty context falls through gracefully (AI still attempts synthesis).

### 5. BlueprintReview cleanup
BlueprintReview handles three phases: reviewing (editable), materializing (disabled state), and done (success display). This consolidation reduces state management complexity in the parent component.

## Test Coverage

| Suite | Tests | Coverage |
|-------|-------|----------|
| Generator tests | 19 | Mode A conversation, Mode B synthesis, extractJsonFromResponse, error paths |
| Validator tests | 17 | Valid blueprints, missing fields, out-of-range indices, partial validation |
| Materializer tests | 6 | Full end-to-end materialization, auto-domain creation, edge cases |
| **Total** | **42** | |

## Limitations & Known Issues

1. **No `projectSeeds`** — deferred per scope v1 (F11.4)
2. **No campaign (multi-course)** — deferred; materializer sets `campaign: null`
3. **BlueprintReview has limited editing** — v1 supports title/domain editing; milestone capability editing and card seed editing are deferred
4. **UI tests deferred** — existing test pattern requires complex mocking of DB + vault + AI; UI tests for BlueprintReview and NewCourseEntry will be added in a follow-up pass (T009/T011 split from T010)
5. **Mode B RAG uses topic search** — for more precise results, future versions could use per-resource-ID chunk retrieval
6. **No idempotent re-materialization** — calling materializeBlueprint again creates duplicate rows; the Materialize button is disabled once materialized in the current session; full idempotent update path is deferred (FR-014 covers re-materializing through the existing course update flow)
