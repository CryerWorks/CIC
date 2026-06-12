# Quickstart: RAG Ingestion Pipeline (017)

**Feature**: 017-rag-ingestion | **Date**: 2026-06-10

## Prerequisites

- CIC running in `tauri dev` (or `npm run tauri dev`)
- At least one vault connected
- AI provider configured with an embedding-capable provider (Ollama with `nomic-embed-text`, or OpenAI-compatible with `text-embedding-3-small`)
- At least one Course with a Domain
- A Resource registered with an attached Markdown file (011 — internalized in `appLocalData/resources/`)

## Scenario A: Ingest a Markdown Resource (P1)

1. Navigate to **Content → Resources**.
2. Click an existing Resource that has a Markdown file attachment.
3. Click **"Ingest"**.
4. **Verify**:
   - Progress indicator shows "Parsing → Chunking → Embedding → Storing".
   - Confirmation appears: "Ingested N chunks from [Resource title]".
   - `ingested_at` timestamp is displayed on the Resource detail.
   - Chunk count is visible.

## Scenario B: Search the Corpus (P2)

1. After Scenario A, navigate to **Search Corpus** (new sidebar nav item).
2. Enter a query related to the Resource's content (e.g., a term from a heading).
3. Click **Search** or press Enter.
4. **Verify**:
   - Results appear with chunks from the ingested Resource.
   - Each result shows: chunk text excerpt, source name, heading path, similarity score, and a **`Resource` source-kind tag** (colored/icon distinct).
   - Results are ordered by relevance (most similar first).
   - Clicking a result shows the full chunk text.

## Scenario C: Vault Scoping (P2)

1. Create or switch to a second vault.
2. Navigate to **Search Corpus**.
3. Search for the content from Scenario A's Resource.
4. **Verify**: The ingested Resource from Vault A does NOT appear — only Vault B's content is searched.

## Scenario D: Re-ingest a Modified Resource (P1, incremental)

1. Edit the source Markdown file (add a new heading section, change some existing text).
2. In CIC, click **"Re-ingest"** on the Resource.
3. **Verify**:
   - Confirmation shows total chunks, and `skippedCount` > 0 (unchanged chunks reused).
   - The new heading appears in search results.
   - Changed sections reflect updated text.
   - No extra embedding calls for unchanged chunks (verify in provider logs if available).

## Scenario E: Lockdown Mode Block (P1)

1. In **Settings → AI**, enable **Local-only lockdown**.
2. Ensure the configured embedding provider is remote (e.g., OpenAI).
3. Attempt to ingest a Resource.
4. **Verify**:
   - Ingestion is blocked with a clear message: "Ingestion blocked: local-only lockdown is enabled and the embedding provider is remote."
   - No chunks are created. The Resource keeps its previous `ingested_at` (if any).

## Scenario F: Index a Vault Note (P5)

1. Ensure a `.md` note exists in the vault (with at least 2 heading sections).
2. In CIC, navigate to the note (via Resource registry or a notes list — see Note Indexing section).
3. Click **"Index this note"**.
4. **Verify**:
   - Confirmation: "Indexed N chunks from [note title]".
   - Search Corpus returns results from this note with a **`Note` source-kind tag**.
   - The tag is visually distinct from `Resource` tags.

## Scenario G: Source-Kind Tag Distinctness (P2, SC-009)

1. Have at least one ingested Resource and one indexed note in the corpus.
2. Navigate to **Search Corpus**.
3. Search for content present in both.
4. **Verify**:
   - Resource results show a `Resource` tag (e.g., purple badge with book icon).
   - Note results show a `Note` tag (e.g., cyan badge with pencil icon).
   - At a glance, the learner can tell "published material" vs "personal writing".

## Scenario H: Filter by Course (P2)

1. Ensure the ingested Resource is linked to a Course (via Resource → Course association).
2. On **Search Corpus**, use the **Course** filter dropdown to select that Course.
3. **Verify**:
   - Only chunks from Resources linked to the selected Course appear.
   - Filter by **source kind `Note`** shows only vault-note chunks.
   - Filters can be used independently or combined.

## Scenario I: Delete Resource → Cascade Chunks (P4)

1. Ingest a Resource (Scenario A).
2. Confirm it appears in search results.
3. Delete the Resource from the registry.
4. **Verify**:
   - Resource, its chunks, and `resource_map` entries are removed.
   - Search Corpus no longer returns results from this Resource.
   - No orphaned data (verify via chunk count).

## Scenario J: EPUB Ingestion (P3)

1. Register a Resource of kind `epub` with an attached `.epub` file (no DRM).
2. Click **"Ingest"**.
3. **Verify**:
   - Progress indicator runs Parsing → Chunking → Embedding → Storing.
   - Confirmation shows chunk count matching TOC sections.
   - Search results show locators like "Chapter 3: Derivatives" (TOC paths).
   - Note: EPUB requires `epub2` npm package. If not installed, surface a clear dependency message.

## Scenario K: Resilience — Corrupt Chunk

1. Manually insert a chunk with a malformed embedding (e.g., wrong dimension or all zeros) via direct DB access.
2. Navigate to **Search Corpus** and search.
3. **Verify**:
   - The corrupt chunk is skipped with a warning in the console (no crash).
   - Other chunks from the same source are still returned correctly.

## Scenario L: Embedding Provider Offline

1. Stop the local Ollama server (or disconnect from the network for remote providers).
2. Attempt to ingest a Resource.
3. **Verify**:
   - Clear error message: "No embedding provider configured. Set one up in Settings → AI."
   - The Resource retains its previous state (no partial ingestion).

## Automated Checks

Run after all scenarios:

```bash
npm run test          # Vitest — all tests green
npm run lint          # ESLint — clean
npm run tsc           # TypeScript strict — clean
cargo check           # Rust — clean (for src-tauri/ changes)
```

Verify test count includes:
- `src/ai/rag/` unit tests (chunker, embedder, ingestor, retriever)
- VectorStore contract tests (Node adapter)
- Integration tests (full pipeline with mock embedding provider)
- Migration tests (m0009 additive, version bump)
- Search Corpus UI tests (render, filter, source-kind tag)
