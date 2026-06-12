# Implementation Plan: RAG Ingestion Pipeline (F10.2 Core)

**Branch**: `017-rag-ingestion` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-rag-ingestion/spec.md`

## Summary

Build the RAG ingestion pipeline: Markdown + EPUB file parsing, heading/TOC-aware chunking, embedding via the existing AI router (016), and storage in sqlite-vec. Layer a `VectorStore` interface (seam pattern) + `useRAG()` hook + dedicated "Search Corpus" page with source-kind tagging (`Resource` vs `Note`). Manual note indexing rounds out the corpus. Content-hash incremental re-ingestion avoids wasted API calls.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) + Rust (for sqlite-vec custom Tauri command)

**Primary Dependencies**: sqlite-vec (Rust crate v0.1.9 + npm v0.1.9 for test adapter), EPUB parser library (TBD in research), Web Crypto API (SHA-256 hashing), existing ai router (016)

**Storage**: SQLite (same CIC database — migration `m0009` adds `chunks`, `resource_map`, `indexed_notes` tables). sqlite-vec virtual table for vector embeddings.

**Testing**: Vitest — test adapter wraps `sqlite-vec` npm package (not the Tauri Rust command). Contract tests verify `VectorStore` interface against spec.

**Target Platform**: Tauri 2 desktop (Windows/macOS/Linux) + Node.js test environment

**Project Type**: Desktop application — Tauri shell + React 19 + Vite

**Performance Goals**: Retrieval <500ms across 500 chunks (brute-force KNN). Ingestion batches of 20 chunks/embedding-call. Content-hash incremental re-ingestion skips unchanged chunks (zero wasted API calls).

**Constraints**: Fully local-first. All embedding calls route through `src/ai/router.ts` → lockdown gate enforced. Vault content never reaches remote when lockdown is ON. Migration additive-only. No new npm deps beyond sqlite-vec + EPUB parser.

**Scale/Scope**: Personal knowledge base — hundreds to low thousands of chunks per vault. Single-user desktop app.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Vault is Canonical and Sacred — PASS

- 017 does **not write** to the vault. Resource files live outside the vault (`appLocalData/resources/`). Chunks live in SQLite.
- Note indexing (P5) **reads** vault `.md` files via `VaultReader` (existing seam) to chunk content, but never writes back.
- The "Index this note" action triggers a read→chunk→embed→store pipeline — the vault note remains untouched.
- Deleted notes: orphaned chunks are cleaned on next vault rescan (FR-029) — read-only detection.

### II. AI Vendor-Agnostic, Not Oracle — PASS

- All embedding calls go through `router.embed('embeddings', …)` — the existing Provider abstraction (016).
- `containsVaultContent: true` is set on every embed call (FR-009).
- Lockdown gate enforced (FR-011): if lockdown is ON and the effective embedding provider is remote, ingestion is blocked with a clear message.
- No AI auto-commits — ingestion is explicitly triggered by the learner.
- No prompts involved — embedding is a deterministic API passthrough.

### III. Preserve Desirable Difficulty — PASS

- No auto-ingestion. The learner explicitly triggers "Ingest" and "Index this note".
- No auto-re-ingestion on file change — learner decides when content is ready.
- No "learned" markers. Chunks are just data.
- Search is user-initiated. Results are passive — the learner decides what to read.

### IV. Interface-First, Deep Modules — PASS

- `VectorStore` interface (spine): `insertChunks`, `deleteBySource`, `search`, `getChunkCount`, `getSourceStats`.
- Adapters: Rust-crate adapter (Tauri production, `src-tauri/` custom command) + Node.js adapter (Vitest tests).
- `useRAG()` hook sits in `src/ai/rag/` — features never import the adapter directly.
- `src/ai/rag/` boundary: parse, chunk, embed, store, retrieve, search. Features import only the hook + types.

### V. Spec-Driven Development — PASS

- Following the full speckit workflow: constitution → specify → clarify → plan → tasks → implement.
- All artifacts (research.md, data-model.md, contracts/, quickstart.md) being generated.

### Gate Result: ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/017-rag-ingestion/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── vector-store.md  # VectorStore interface contract
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── ai/
│   ├── rag/                    # NEW — RAG pipeline
│   │   ├── vectorStore.ts      # VectorStore interface (spine)
│   │   ├── types.ts            # Chunk, ChunkResult, SearchFilters, NoteRef
│   │   ├── chunker/
│   │   │   ├── markdown.ts     # Markdown parser + chunker
│   │   │   └── epub.ts         # EPUB parser + chunker
│   │   ├── embedder.ts         # Batch embedding via router
│   │   ├── ingestor.ts         # Orchestration: parse → chunk → embed → store
│   │   ├── noteIndexer.ts      # Note-specific index/unindex + vault rescan cleanup
│   │   ├── retriever.ts        # Query → embed → KNN search → results
│   │   └── hooks/
│   │       └── useRAG.ts       # React hook: useRAG() for features
│   ├── adapters/               # Existing — new RAG adapters
│   │   └── rag/
│   │       ├── tauri.ts        # Tauri VectorStore adapter (calls Rust command)
│   │       ├── node.ts         # Node.js VectorStore adapter (tests)
│   │       └── tauriFetch.ts   # Existing (016) — reused for embed calls
│   ├── provider.ts             # Existing (016) — router.embed()
│   ├── router.ts               # Existing (016) — AIRouter interface
│   └── config.ts               # Existing (016) — provider probing/reporting
├── components/
│   └── ai/
│       └── SearchCorpus.tsx    # NEW — Search Corpus page UI
├── features/
│   ├── search/                 # NEW — Search feature
│   │   ├── SearchCorpusRoute.tsx  # Route + state management
│   │   ├── SearchResults.tsx      # Result list with source-kind tags
│   │   └── SearchFilters.tsx      # Course/Resource/source-kind filter bar
│   ├── resources/              # Existing (010/011) — extend
│   │   └── ResourceDetailRoute.tsx  # Add "Ingest" button + status
│   └── settings/               # Existing (016)
│       └── ai/                 # Existing — embed provider config already here
├── db/
│   └── migrations/
│       └── m0009_rag.ts        # NEW — chunks, resource_map, indexed_notes
└── app/
    └── routes.tsx              # Add /search route

src-tauri/
├── src/
│   ├── lib.rs                  # Add rag commands (init, insert, search, delete)
│   ├── rag.rs                  # NEW — sqlite-vec Rust adapter
│   └── db.rs                   # Existing SQLite pool
└── Cargo.toml                  # Add sqlite-vec dependency

tests/
├── ai/rag/                     # NEW
│   ├── chunker.test.ts         # Markdown + EPUB chunking tests
│   ├── ingestor.test.ts        # Full ingest pipeline (test adapter)
│   ├── retriever.test.ts       # Retrieval correctness tests
│   ├── vectorStore.test.ts     # VectorStore contract tests (test adapter)
│   └── noteIndexer.test.ts     # Note indexing + vault rescan tests
├── features/
│   └── search/                 # NEW
│       └── SearchCorpusRoute.test.tsx
└── db/
    └── migrations/
        └── m0009.test.ts       # Migration tests
```

**Structure Decision**: The RAG pipeline lives under `src/ai/rag/` — a new module adjacent to the existing `src/ai/adapters/` and `src/ai/provider.ts`. This follows the existing AI layer structure: spine interfaces in the root of `src/ai/`, deep implementations in subdirectories. The Search Corpus page is a new feature under `src/features/search/` with its own hook and components. Rust integration follows the 011 pattern: custom Tauri commands in `src-tauri/src/rag.rs`, called through a JS adapter in `src/ai/adapters/rag/`.

## Complexity Tracking

> No Constitution violations detected — this section intentionally empty.
