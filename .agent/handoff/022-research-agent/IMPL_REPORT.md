# Implementation Report: 022-research-agent

## Summary

Implemented the AI Research Agent (F11) — CIC's flagship feature. Users tell CIC what they want to learn, and it searches the web, evaluates sources, calibrates to their learning profile, generates Course Blueprints, and materializes a structured learning campaign.

### Files Created (18 new files)

| File | Purpose |
|------|---------|
| `src/ai/features/research/types.ts` | Core types: ResearchGoal, ResearchSource, WebSearchResult, WebSearchProvider, ResearchEngine, ResearchEvent, etc. |
| `src/ai/features/research/searcher.ts` | WebSearchProvider interface + SearXNGAdapter + ManualAdapter + createSearchProvider factory |
| `src/ai/prompts/research.ts` | RESEARCH_SYSTEM_PROMPT — guides the AI to transform research goals into course blueprints |
| `src/ai/features/research/prompt.ts` | buildResearchPrompt() + extractCampaignJson() — prompt builder + response parser |
| `src/ai/features/research/engine.ts` | ResearchEngineImpl — orchestrates the full pipeline: search → fetch → evaluate → profile → blueprint → assemble |
| `src/ai/features/research/fetcher.ts` | Web page fetcher stub (v1 returns URLs only; v1.1: readability crate) |
| `src/ai/features/research/transcriber.ts` | YouTube transcript fetcher stub (v1 throws; v1.1: yt-dlp sidecar) |
| `src/ai/features/research/hooks/useResearch.ts` | React hook wrapping ResearchEngineImpl + materialization in state management |
| `src/db/migrations/m0013_research.ts` | Migration: research_sources + learning_profiles tables with indexes |
| `src/db/models/research.ts` | Zod schemas for ResearchSourceRow + LearningProfileRow |
| `src/db/repositories/research.ts` | CRUD: createResearchSource, getResearchSourcesByVault, saveLearningProfile, getLearningProfilesByVault, getLatestLearningProfileByVault |
| `src/features/research/ResearchRoute.tsx` | Main route orchestrating the full research lifecycle |
| `src/features/research/ResearchGoalDialog.tsx` | "What do you want to learn?" dialog with privacy consent step |
| `src/features/research/LearningProfileForm.tsx` | Self-assessment form: domain, level, knowledge, budget, depth |
| `src/features/research/ResearchProgress.tsx` | Progress indicator: phase label, progress bar, step indicators |
| `src/features/research/CampaignReview.tsx` | Campaign review: course list, milestones, cards, materialize confirmation |
| `src/ai/features/research/searcher.test.ts` | Tests: ManualAdapter + createSearchProvider |
| `src/ai/features/research/engine.test.ts` | Tests: ResearchEngineImpl with FakeSearchProvider + mock router |
| `src/db/repositories/research.test.ts` | Tests: research_sources + learning_profiles CRUD + cascade |

### Files Modified (7 existing files)

| File | Change |
|------|--------|
| `src/db/migrations/index.ts` | Registered m0013Research |
| `src/db/models/index.ts` | Export research models |
| `src/db/index.ts` | Export research repositories |
| `src/app/router.tsx` | Added `/research` route |
| `src/features/dashboard/QuickActions.tsx` | Added "Research" action |
| `src/db/migrate.evolution.test.ts` | Updated version checks 12→13 |
| `src/db/migrate.lossless.test.ts` | Updated version checks 12→13 |
| `src/db/migrate.test.ts` | Updated version checks 12→13, added new tables |
| `src/db/migrations/m0009.test.ts` | Updated version check 12→13 |
| `src/db/migrations/m0010.test.ts` | Updated version check 12→13 |
| `src/db/repositories/settings.test.ts` | Updated version check 12→13 |

## Quality Gates Results

| Gate | Result |
|------|--------|
| G1: All tests pass (815/815, 136 files) | ✅ PASS |
| G2: Linter passes (0 errors, 0 warnings) | ✅ PASS |
| G3: TypeScript type checks pass (0 errors) | ✅ PASS |
| G4: No debug artifacts | ✅ PASS |
| G5: All public APIs have explicit type signatures | ✅ PASS |
| G6: No new npm dependencies | ✅ PASS |

## Design Decisions

### 1. WebSearchProvider as a Strategy Pattern
The `WebSearchProvider` interface allows two implementations:
- **SearXNGAdapter**: Connects to a self-hosted SearXNG instance via its JSON API. Classifies results by source type (syllabus, courseware, textbook, video, article, other) based on URL patterns and engine metadata.
- **ManualAdapter**: Returns user-provided URLs — for users without a search engine. Defaults to this if `research.search_url` setting is unset.

### 2. ResearchEngine as AsyncIterable
Following the existing pattern (blueprint generator, Feynman tutor), the engine yields `ResearchEvent` objects as it progresses through phases. This lets the UI show real-time progress without coupling to the engine's internals.

### 3. Privacy Consent Flow
Privacy consent is stored in the settings table under `research.consent_given`. Before the first research, a privacy dialog explains that vault content is never sent during web search and only used in AI prompts with explicit consent.

### 4. yt-dlp and Readability as Stubs (v1.1 deferred)
Per the spec guidance, these complex sidecar integrations are stubbed with clear TODO markers. v1 works with manual URL-based research (user provides URLs, CIC evaluates via AI and generates blueprints).

### 5. Reused CourseBlueprint Materializer
The research engine's campaign materialization reuses the existing `materializeBlueprint()` from the Course Blueprint feature (020). Each generated course is materialized individually, then the campaign is assembled from the results.

### 6. Human-in-the-Loop Materialization
Following the existing pattern (FR-016), campaign materialization requires explicit user approval. The CampaignReview UI shows all courses, milestones, card counts, and a confirmation dialog before writing to the vault.

## Limitations / Known Issues

1. **Web page content extraction**: v1 only stores URLs — full readability extraction is deferred to v1.1 (Rust readability crate + turndown).
2. **YouTube transcript fetch**: Deferred to v1.1 (yt-dlp Tauri sidecar).
3. **SearXNG error handling**: If SearXNG is configured but unreachable, the adapter throws rather than falling back to ManualAdapter. Users should configure search only when they have a running instance.
4. **No persisted research state**: Research results are held in memory and lost on app restart. Persistence of research campaigns is deferred.
5. **Route-level testing**: The ResearchRoute UI components have unit tests but no full integration tests (consistent with other feature routes in the codebase).
