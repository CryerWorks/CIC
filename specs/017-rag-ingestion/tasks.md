# Tasks: RAG Ingestion Pipeline (F10.2)

**Input**: Design documents from `specs/017-rag-ingestion/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — core logic (chunking, ingestion, retrieval, vector store) requires unit tests per Constitution IV.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration, Rust dependency, npm dependency, shared types

- [x] T001 Run `cargo add sqlite-vec` in `src-tauri/` and add `rag_init`/`rag_insert_chunks`/`rag_delete_by_source`/`rag_search`/`rag_get_source_stats`/`rag_get_chunk_count` command stubs in `src-tauri/src/rag.rs`
- [x] T002 [P] Install npm packages: `sqlite-vec` (dev), `epub2` in project root
- [x] T003 [P] Create migration `m0009_rag.ts` in `src/db/migrations/` adding `chunks`, `resource_map`, `indexed_notes` tables and `chunks_vec` sqlite-vec virtual table per research.md R6
- [x] T004 [P] Create RAG type definitions (`ChunkInput`, `ChunkRow`, `SearchFilter`, `SearchResult`, `SourceStats`, `IngestResult`, `IngestState`) in `src/ai/rag/types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: VectorStore interface, test adapter, chunkers — everything US1–US5 depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Define `VectorStore` interface (`init`, `insertChunks`, `deleteBySource`, `search`, `getSourceStats`, `getChunkCount`) in `src/ai/rag/vectorStore.ts` per contracts/vector-store.md
- [x] T006 [P] Implement Node.js test adapter (`createNodeVectorStore`) wrapping `sqlite-vec` npm + `better-sqlite3` in `src/ai/adapters/rag/node.ts`
- [x] T007 [P] Write VectorStore contract tests (init, insert, search, delete, stats) in `tests/ai/rag/vectorStore.test.ts`
- [x] T008 [P] Implement Markdown heading-based chunker (`chunkMarkdown(text, title): ChunkInput[]`) — regex heading detection, heading path tracking, wikilink preservation, frontmatter exclusion, paragraph-respecting splits for oversized sections — in `src/ai/rag/chunker/markdown.ts`
- [x] T009 [P] Write Markdown chunker tests (headings, wikilinks, frontmatter, oversized, nested levels, empty content) in `tests/ai/rag/chunker.test.ts`
- [x] T010 Implement Tauri RAG Rust commands (`rag_init`, `rag_insert_chunks`, `rag_delete_by_source`, `rag_search`, `rag_get_source_stats`, `rag_get_chunk_count`) in `src-tauri/src/rag.rs` — sqlite-vec `vec0` virtual table, KNN via `MATCH`, batch insert with JSON-chunk deserialization
- [x] T011 [P] Implement Tauri VectorStore adapter (calls Rust commands via `invoke`) in `src/ai/adapters/rag/tauri.ts`
- [x] T012 Register RAG Rust commands in `src-tauri/src/lib.rs` and add `rag:default` capability in `src-tauri/capabilities/default.json`

**Checkpoint**: Foundation ready — VectorStore interface + both adapters + Markdown chunker all test green. User story implementation can now begin.

---

## Phase 3: User Story 1 - Ingest a Markdown Resource (Priority: P1) 🎯 MVP

**Goal**: Learner clicks "Ingest" on a Markdown Resource → file parsed, chunked, embedded, stored → confirmation with chunk count

**Independent Test**: Register a Markdown Resource with file, trigger ingestion, verify chunk count > 0, verify `ingested_at` set, verify retrieval returns chunks matching query

### Implementation for User Story 1

- [x] T013 [P] [US1] Implement embedder (`embedChunks(chunks, router, vaultId): Promise<ChunkInput[]>`) — batch embedding via `router.embed('embeddings', texts, {containsVaultContent: true})`, lockdown gate check, atomic rollback on failure — in `src/ai/rag/embedder.ts`
- [x] T014 [US1] Implement ingestor (`ingestResource(resourceId, vaultId, db, vectorStore, router, vaultReader): Promise<IngestResult>`) — parse file via Markdown chunker → embed → insertChunks → update `resources.ingested_at` — in `src/ai/rag/ingestor.ts`
- [x] T015 [P] [US1] Implement content hashing utility (`hashContent(text): string`) using Web Crypto SHA-256 and incremental re-ingestion logic (`findUnchangedChunks`) in `src/ai/rag/ingestor.ts`
- [x] T016 [P] [US1] Write ingestor tests (happy path, no file, provider offline, lockdown block, re-ingestion, incremental hash skip) in `tests/ai/rag/ingestor.test.ts`
- [x] T017 [P] [US1] Write migration tests (m0009 additive, version bump, table schemas, FK cascade, vault scope) in `tests/db/migrations/m0009.test.ts`
- [x] T018 [US1] Add "Ingest" button + status display (chunk count, `ingested_at`, progress indicator) to `src/features/resources/ResourceDetailRoute.tsx`
- [x] T019 [US1] Implement `useRAG()` hook stub — `ingestResource` method wired through to ingestor + VectorStore adapter — in `src/ai/rag/hooks/useRAG.ts`
- [x] T020 [US1] Wire `useRAG` into the Resource detail "Ingest" button; handle loading/error/done states; show `IngestState` progress in `src/features/resources/ResourceDetailRoute.tsx`

**Checkpoint**: At this point, User Story 1 should be fully functional — Markdown ingest end-to-end with chunk count confirmation and `ingested_at` display

---

## Phase 4: User Story 2 - Search the knowledge corpus (Priority: P2)

**Goal**: Dedicated "Search Corpus" page with search input, result list, source-kind tags (`Resource` vs `Note`), Course/source-kind filters

**Independent Test**: Ingest two Resources with distinct topics, query for one, verify top results are from correct Resource with `Resource` tag and descending similarity

### Implementation for User Story 2

- [x] T021 [P] [US2] Implement retriever (`searchCorpus(query, k, filters, vaultId, router, vectorStore): Promise<SearchResult[]>`) — embed query → KNN search via vectorStore.search → enrich with source_kind/resource_id/milestone_id — in `src/ai/rag/retriever.ts`
- [x] T022 [P] [US2] Write retriever tests (top-k correctness, vault scoping, empty corpus, dimension mismatch, corrupt vector skip, filter by Course/sourceKind) in `tests/ai/rag/retriever.test.ts`
- [x] T023 [US2] Extend `useRAG()` hook with `search`, `getSourceStats`, `getChunkCount` methods in `src/ai/rag/hooks/useRAG.ts`
- [x] T024 [P] [US2] Create SearchFilters component (Course dropdown, source-kind toggle Resource/Note/All, search input) in `src/features/search/SearchFilters.tsx`
- [x] T025 [P] [US2] Create SearchResults component (chunk excerpt, source name, heading_path locator, similarity score, colored source-kind tag badge) in `src/features/search/SearchResults.tsx`
- [x] T026 [US2] Create SearchCorpusRoute (state management, query → search → results display, loading/empty/error states) in `src/features/search/SearchCorpusRoute.tsx`
- [x] T027 [US2] Add `/search` route in `src/app/routes.tsx` and add "Search Corpus" nav item in sidebar
- [x] T028 [US2] Write SearchCorpusRoute tests (render, search query, filter controls, source-kind tag distinctness, no-results state, vault scoping) in `tests/features/search/SearchCorpusRoute.test.tsx`

**Checkpoint**: User Stories 1 AND 2 both work — ingest → search → filtered results with source-kind tags

---

## Phase 5: User Story 3 - Ingest an EPUB Resource (Priority: P3)

**Goal**: Register EPUB Resource → Ingest → EPUB parsed by spine/TOC → chunked → embedded → stored → retrieval works

**Independent Test**: Register EPUB Resource with `.epub` file, trigger ingestion, verify chunks created (≥ TOC sections), verify retrieval returns hits

### Implementation for User Story 3

- [x] T029 [P] [US3] Implement EPUB parser (`parseEpub(filePath): ParsedEpub`) — extract spine items in order, TOC structure, text content, strip HTML, normalize whitespace — using `epub2` npm — in `src/ai/rag/chunker/epub.ts`
- [x] T030 [US3] Implement EPUB chunker (`chunkEpub(parsedEpub): ChunkInput[]`) — split by TOC sections, oversized-section paragraph splitting, TOC-path locators — in `src/ai/rag/chunker/epub.ts`
- [x] T031 [P] [US3] Write EPUB chunker tests (TOC sections, large sections, no-TOC fallback, DRM detection, empty sections, image-only sections) in `tests/ai/rag/chunker.test.ts` (extend existing)
- [x] T032 [US3] Extend ingestor to detect `resource.kind === 'epub'` and route to EPUB parser+chunker (same embed+store pipeline) in `src/ai/rag/ingestor.ts`
- [x] T033 [US3] Wire EPUB ingest trigger in `ResourceDetailRoute.tsx` — same "Ingest" button, different progress label ("Parsing EPUB…")

**Checkpoint**: EPUB ingest works end-to-end; search retrieval returns EPUB chunks with TOC locators

---

## Phase 6: User Story 4 - View and manage ingested Resources (Priority: P4)

**Goal**: Resource detail shows ingestion status, chunk count, timestamp; delete cascade; re-ingestion trigger

**Independent Test**: Ingest a Resource, view detail → chunk count + timestamp visible. Delete Resource → cascade removes chunks.

### Implementation for User Story 4

- [x] T034 [P] [US4] Implement source stats query (`getSourceStats(vaultId): SourceStats[]`) via VectorStore + read-model in `src/ai/rag/retriever.ts`
- [x] T035 [US4] Add ingestion status display (chunk count, `ingested_at`, "Re-ingest" button) to `src/features/resources/ResourceDetailRoute.tsx` (extend T018)
- [x] T036 [US4] Ensure cascade delete: when a Resource is deleted, `chunks`, `chunks_vec`, and `resource_map` entries are removed — verify in existing Resource delete flow
- [x] T037 [US4] Add "Remove from index" action on ingested Resources (clears chunks, resets `ingested_at`) in `src/features/resources/ResourceDetailRoute.tsx`

**Checkpoint**: Management UI complete — learner can see and manage what's in the corpus

---

## Phase 7: User Story 5 - Index a personal vault note (Priority: P5)

**Goal**: Learner clicks "Index this note" → note parsed by same Markdown pipeline → embedded → stored with `source_kind: note` → appears in search with `Note` tag

**Independent Test**: Create vault note with 3 headings, click "Index this note", verify it appears in search results with `Note` tag

### Implementation for User Story 5

- [x] T038 [P] [US5] Implement note indexer (`indexNote(notePath, vaultId, db, vectorStore, router, vaultReader): Promise<IngestResult>`) — read note via VaultReader → chunk (Markdown, source_kind='note') → embed → store → upsert `indexed_notes` row — in `src/ai/rag/noteIndexer.ts`
- [x] T039 [US5] Implement note unindexer (`unindexNote(notePath, vaultId, vectorStore, db): Promise<void>`) — deleteBySource + delete `indexed_notes` row — in `src/ai/rag/noteIndexer.ts`
- [x] T040 [P] [US5] Write note indexer tests (index, re-index, unindex, vault rescan orphan cleanup, duplicate index idempotent) in `tests/ai/rag/noteIndexer.test.ts`
- [x] T041 [US5] Extend `useRAG()` with `indexNote`, `unindexNote`, `isNoteIndexed` methods in `src/ai/rag/hooks/useRAG.ts`
- [x] T042 [US5] Add "Index this note" / "Remove from index" action in the vault note context (reuse existing note detail UI pattern from 010/013) in `src/features/search/SearchCorpusRoute.tsx` or a notes list component

**Checkpoint**: Note indexing complete — note chunks appear in search with distinct `Note` tag

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Integration validation, edge case hardening, quickstart walkthrough

- [x] T043 [P] Add ESLint `no-restricted-imports` rule: only `src/ai/rag/vectorStore.ts` and `src/ai/adapters/rag/` may import `sqlite-vec` — enforce adapter boundary
- [x] T044 [P] Verify lockdown gate: write an integration test confirming ingestion is blocked with clear message when lockdown=ON and provider is remote in `tests/ai/rag/ingestor.test.ts` (extend T016)
- [x] T045 Run full quickstart.md validation (scenarios A–L) against live `tauri dev`
- [x] T046 Run `npm run test`, `npm run lint`, `npm run tsc`, `cargo check` — all green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion (T001–T004) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) — MVP
- **User Story 2 (Phase 4)**: Depends on US1 (ingestor + embedder) + Foundational — search needs stored chunks to retrieve
- **User Story 3 (Phase 5)**: Depends on US1 (embedder + ingestor reuse) — EPUB plugs into existing pipeline
- **User Story 4 (Phase 6)**: Depends on US1 (ingested state exists) — management UI shows ingestion data
- **User Story 5 (Phase 7)**: Depends on US1 (Markdown chunker) + US2 (search displays Note tags) — note indexing reuses the same pipeline
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 — needs `ingestor` (chunk+embed+store) to have data; `retriever` is new but searches stored data
- **User Story 3 (P3)**: Depends on US1 — reuses `embedder` + `ingestor` + `retriever`
- **User Story 4 (P4)**: Depends on US1 — shows ingested state
- **User Story 5 (P5)**: Depends on US1 (chunker, embedder, ingestor reuse) + US2 (search UI displays Note tags)

### Within Each User Story

- Types/interface before implementation
- Tests before/during implementation (Constitution IV)
- Core logic before UI wiring
- Story complete before moving to next (incremental delivery)

### Parallel Opportunities

- T001/T002/T003/T004 in Setup can run in parallel (different files)
- T006/T007/T008/T009 in Foundational can run in parallel (different files, no deps on each other)
- T013/T015/T016/T017 in US1 can run in parallel (different files)
- T021/T022/T024/T025 in US2 can run in parallel (different files)
- T029/T031 in US3 can run in parallel (different files)
- T038/T040 in US5 can run in parallel (different files)
- T043/T044 in Polish can run in parallel (different files)

### Within Foundational

```
T005 → [T006, T007, T008, T009, T010 → T011, T012]
        └─ T006/T007: Node adapter + contract tests (parallel)
        └─ T008/T009: Markdown chunker + tests (parallel)
        └─ T010 → T011 → T012: Rust commands → Tauri adapter → registration (sequential)
```

---

## Parallel Example: User Story 1

```bash
# Launch chunker + embedder + hashing + tests in parallel:
Task: "Implement embedder in src/ai/rag/embedder.ts" (T013)
Task: "Implement content hashing utility in src/ai/rag/ingestor.ts" (T015)
Task: "Write ingestor tests in tests/ai/rag/ingestor.test.ts" (T016)
Task: "Write migration tests in tests/db/migrations/m0009.test.ts" (T017)
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (Markdown ingest)
4. Complete Phase 4: User Story 2 (Search)
5. **STOP and VALIDATE**: Test US1 + US2 independently — ingest → search → filtered results
6. This is the functional core — a working RAG pipeline

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Markdown ingest working → verify (MVP foundation)
3. US2 → Search Corpus page functional → verify (RAG complete for Markdown)
4. US3 → EPUB ingest working → verify
5. US4 → Management UI complete → verify
6. US5 → Note indexing working → verify (corpus complete)
7. Each story adds value without breaking previous stories

### Single Developer Strategy

Implement in priority order (P1 → P5):
1. Phase 1 + 2 → get foundation green (T001–T012)
2. Phase 3 (US1) → Markdown ingest end-to-end (T013–T020)
3. Phase 4 (US2) → Search Corpus page (T021–T028)
4. Phase 5 (US3) → EPUB ingest (T029–T033)
5. Phase 6 (US4) → Management UI (T034–T037)
6. Phase 7 (US5) → Note indexing (T038–T042)
7. Phase 8 → Polish + quickstart validation (T043–T046)

---

## Task Summary

| Phase | Story | Tasks | Parallel Opportunities |
|-------|-------|-------|----------------------|
| Setup (1) | — | T001–T004 (4) | All 4 parallel |
| Foundational (2) | — | T005–T012 (8) | 2 groups: interface+chunker+tests + Rust chain |
| US1 (3) | P1 Markdown Ingest | T013–T020 (8) | T013/T015/T016/T017 parallel |
| US2 (4) | P2 Search | T021–T028 (8) | T021/T022/T024/T025 parallel |
| US3 (5) | P3 EPUB Ingest | T029–T033 (5) | T029/T031 parallel |
| US4 (6) | P4 Management | T034–T037 (4) | T034 parallel |
| US5 (7) | P5 Note Indexing | T038–T042 (5) | T038/T040 parallel |
| Polish (8) | — | T043–T046 (4) | T043/T044 parallel |
| **Total** | | **46 tasks** | |

**Tests**: 10 test files (T007, T009, T016, T017, T022, T028, T031, T040, T044, T045)
**Rust**: 3 tasks (T001, T010, T012)
**New files**: ~25 source files + ~10 test files
