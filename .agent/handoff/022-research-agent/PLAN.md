# PLAN: AI Research Agent Implementation

## Architecture

### New Files

```
src/ai/features/research/
  types.ts           — ResearchGoal, ResearchSource, WebSearchResult, etc.
  searcher.ts        — WebSearchProvider interface + SearXNG adapter + ManualAdapter
  prompt.ts          — RESEARCH_SYSTEM_PROMPT + buildResearchPrompt()
  engine.ts          — ResearchEngine orchestrator (search → eval → profile → blueprint)

src/ai/prompts/
  research.ts        — RESEARCH_SYSTEM_PROMPT export

src/db/migrations/
  m0013_research.ts  — research_sources + learning_profiles tables

src/db/models/
  research.ts        — Zod schemas for research tables

src/db/repositories/
  research.ts        — createResearchSource, getResearchSourcesByVault, 
                       saveLearningProfile, getLearningProfilesByVault

src/features/research/
  ResearchRoute.tsx          — Main route for research feature
  ResearchGoalDialog.tsx     — "What do you want to learn?" dialog
  LearningProfileForm.tsx    — Self-assessment form
  ResearchProgress.tsx       — Progress indicator (searching → fetching → assembling)
  CampaignReview.tsx         — Review campaign before materialize
  useResearch.ts             — Main hook wrapping ResearchEngine
```

### Modified Files

```
src/db/migrations/index.ts        — Register m0013
src/db/models/index.ts            — Export research models
src/db/repositories/index.ts      — Actually re-exported via src/db/index.ts
src/db/index.ts                   — Export research repos & models
src/app/router.tsx                 — Add ResearchRoute
src/features/dashboard/QuickActions.tsx — Add "Research" action
```

## Implementation Order

### Phase 1: Foundation (T001-T003)
1. Types (`src/ai/features/research/types.ts`)
2. WebSearchProvider (`src/ai/features/research/searcher.ts`) 
3. Research prompt (`src/ai/prompts/research.ts`, `src/ai/features/research/prompt.ts`)
4. Migration + models + repos

### Phase 2: Engine (T004-T006) 
5. ResearchEngine orchestrator
6. Web fetcher stub
7. yt-dlp stub

### Phase 3: UI (T008-T011)
8. useResearch hook
9. ResearchGoalDialog
10. LearningProfileForm
11. ResearchProgress
12. CampaignReview
13. ResearchRoute
14. Wire into router + QuickActions

### Phase 4: Tests + Quality (T007, T012)
15. FakeSearchProvider + engine tests
16. Quality gates
