# Handoff: 022-research-agent — AI Research Agent (F11)

**Feature**: 022-research-agent | **Branch**: `022-research-agent` | **Handoff**: 2026-06-16

## Scope

The flagship AI feature: tell CIC what you want to learn, and it researches the web, builds a campaign of courses, and materializes a structured learning plan — all in one pipeline.

Four sub-features:
1. **F11.1 Web Research Engine** — search web for materials, fetch + convert to RAG
2. **F11.2 Learning Profile** — user self-assessment → AI maps to material index
3. **F11.3 Curriculum Assembler** — select sources → Course Blueprint(s) → Campaign
4. **F11.4 Campaign Orchestration** — domain-level planning across multiple courses

## Key Dependencies

| 016 router.chat('scaffolding') | 017 RAG search + ingest | 020 Course Blueprint | 005 VaultWriter | 010 createCard | m0012 course_dependencies |

## New Dependencies

| yt-dlp (Tauri sidecar) | @mozilla/readability (Rust crate) | turndown (Rust crate) |
|---|---|---|
| YouTube transcript + timing | Web page → article extract | HTML → Markdown |

## WebSearchProvider Interface

```ts
interface WebSearchProvider {
  search(query: string, count: number): Promise<WebSearchResult[]>;
}
interface WebSearchResult {
  title: string; url: string; snippet: string; sourceType: 'syllabus' | 'courseware' | 'textbook' | 'video' | 'article' | 'other';
}
```

Adapters:
1. **SearXNG** — user's local instance URL in settings (`research.search_url`)
2. **None/placeholder** — if no search engine configured, user provides URLs manually

## Tasks (~15)

### Phase 1: Setup
- T001: WebSearchProvider interface + SearXNG adapter in `src/ai/features/research/searcher.ts`
- T002: Research types + prompt in `src/ai/prompts/research.ts` and `src/ai/features/research/types.ts`
- T003: Migration m0013 — `research_sources` + `learning_profiles` tables

### Phase 2: Core Engine
- T004: ResearchAgent orchestrator — search → fetch → eval → profile → blueprint in `src/ai/features/research/engine.ts`
- T005: Web page fetcher via readability (Rust command) + Markdown converter
- T006: YouTube transcript fetcher via yt-dlp sidecar → parse SRT → register as Resource with timing
- T007: ResearchAgent tests with fake search provider + fake router

### Phase 3: Campaign Orchestration
- T008: Campaign-level curriculum assembler — decompose goal → courses → blueprints
- T009: Materialize campaign + courses via existing repos
- T010: Campaign assembly tests

### Phase 4: UI
- T011: ResearchGoalDialog — "What do you want to learn?" + privacy consent
- T012: LearningProfileForm — skill self-assessment
- T013: ResearchProgress — progress indicator (searching → fetching → assembling)
- T014: CampaignReview — review generated campaign before materialize

### Phase 5: Polish
- T015: Quality gates — test, lint, tsc, cargo

## Architecture rules
- All AI via router.chat('scaffolding') with containsVaultContent: true
- Privacy consent stored in settings KV (research.consent_given)
- Web search never sends vault content
- Campaign materialization is human-in-the-loop (never auto-commit)
- Scaffold mode only — card fronts, no pre-written answers
