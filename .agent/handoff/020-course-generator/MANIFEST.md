# Handoff: 020-course-generator — Course Generation Engine (F10)

**Feature**: 020-course-generator | **Branch**: `020-course-generator` | **Handoff**: 2026-06-15

## Scope v1

- **Mode A**: Conversational "Campaign Architect" — AI-guided dialogue → Course Blueprint
- **Mode B**: Generate course from existing ingested Resources (017)
- **Blueprint IR**: Structured intermediate representation (milestones, cardSeeds, retrievalQs, feynmanTargets, resourceMap)
- **Review UI**: Editable blueprint form + dependency graph visualization
- **Materialize**: Write MOC to vault + SQLite rows + suggested cards
- **Scaffold only**: Fronts of cards, structure of notes — no pre-written answers

## Dependencies (all satisfied)

| 016 router.chat('scaffolding') | 017 RAG search | 007 course MOC writer | 010 card creation | 005 VaultWriter |

## Tasks (~15)

### Phase 1: Setup
- T001: Blueprint types (`src/ai/features/blueprint/types.ts`) — Blueprint IR, MilestoneSeed, CardSeed, RetrievalQ, FeynmanTarget
- T002: Architect prompt (`src/ai/prompts/architect.ts`) — conversational course designer system prompt

### Phase 2: Core
- T003: Blueprint generator — Mode A sparring (`src/ai/features/blueprint/generator.ts`)
- T004: Blueprint generator — Mode B synthesis
- T005: Blueprint validator — zod schema + validation
- T006: Materializer — writes MOC via VaultWriter + SQLite rows via repos (`src/ai/features/blueprint/materializer.ts`)

### Phase 3: UI
- T007: Target-setting dialog — scope, depth, topic picker
- T008: BlueprintReview — editable milestone list, card seeds, Qs, dependency graph
- T009: "New Course" entry point — two paths (Design with AI / Generate from Resources)

### Phase 4: Polish
- T010: Generator + materializer tests
- T011: Blueprint review UI tests
- T012: Quality gates — test, lint, tsc

## Key interfaces

```ts
interface CourseBlueprint {
  title: string;
  domain: { name: string; color?: string };
  target: { scope: 'course'; depth: 'overview' | 'working' | 'mastery' };
  milestones: MilestoneSeed[];
  cardSeeds: CardSeed[];
  retrievalQs: RetrievalQ[];
  feynmanTargets: FeynmanTarget[];
  resourceMap: BlueprintResourceMap[];
}
```

## Architecture rules
- All AI via `router.chat('scaffolding', …)` with `containsVaultContent: true`
- Scaffold ONLY — card fronts without backs, note structure without content
- Never auto-commit — materialize requires explicit approval
- VaultWriter for MOC, existing repos for SQLite
- No new npm deps, no Rust changes, no new migration (reuse existing schema)
