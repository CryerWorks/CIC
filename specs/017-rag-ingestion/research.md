# Research: RAG Ingestion Pipeline (017)

**Feature**: 017-rag-ingestion | **Date**: 2026-06-10

## R1: sqlite-vec Integration Pattern

### Decision: Rust crate in src-tauri + npm package for tests, behind VectorStore interface

**Rationale**: sqlite-vec is a C library with Rust and Node.js bindings. The Tauri app runs in a Rust context — `cargo add sqlite-vec` compiles the C library into the app binary and exposes vector operations through custom Tauri commands (matching the 011 pattern: `invoke('rag_search', {…})`). For tests, the npm package `sqlite-vec` provides a Node.js binding compatible with `better-sqlite3` — no Tauri runtime needed.

**Integration pattern** (mirrors `SqlExecutor` / `SecretStore` / `VaultFs`):
1. **Interface** (`src/ai/rag/vectorStore.ts`): `VectorStore` with methods `init()`, `insertChunks(chunks, db)`, `deleteBySource(sourceId, sourceKind, db)`, `search(queryVector, k, filters, db)`, `getSourceStats(db)`.
2. **Tauri adapter** (`src/ai/adapters/rag/tauri.ts`): calls `invoke('rag_insert', {…})` etc. The Rust side manages the sqlite-vec virtual table + KNN queries.
3. **Node.js adapter** (`src/ai/adapters/rag/node.ts`): uses `sqlite-vec` npm + `better-sqlite3` directly for vitest.
4. **Rust commands** (`src-tauri/src/rag.rs`):
   - `rag_init(vault_id)` — attaches sqlite-vec extension to the SQLite connection
   - `rag_insert(vault_id, chunks: Vec<ChunkRow>)` — batch insert chunks + embeddings
   - `rag_search(vault_id, query_vector, k, filters)` — KNN via `MATCH` on the vec0 virtual table
   - `rag_delete_by_source(vault_id, source_id, kind)` — remove chunks for a Resource or note
   - `rag_get_stats(vault_id)` — chunk counts by source

**sqlite-vec virtual table approach**:
- Use `vec0` virtual table (not `vec_each`): stores `(id, vector, +metadata)` directly.
- On insert: `INSERT INTO chunks_vec (embedding) VALUES (vec_f32(?))` — vector is a blob.
- On search: `SELECT rowid, distance FROM chunks_vec WHERE embedding MATCH vec_f32(?) ORDER BY distance LIMIT ?` + JOIN back to `chunks` for metadata.
- sqlite-vec stores vectors as blobs in the database file — no separate storage. Vault-scoped by including `vault_id` in the metadata JOIN via `chunks` table.

**Alternatives considered**:
- LanceDB: rejected (separate storage, Arrow dependency, JS addon incompatibility with Tauri webview). See separate vector store comparison doc.
- sqlite-vec via wasm in the webview: works offline but slower than native Rust. Native Rust is the right layer for KNN computation.
- Custom KNN in JS: reinventing the wheel; sqlite-vec is purpose-built, Mozilla-backed, and exact.

**Locked: Rust crate integration, 011-style custom Tauri commands.**

**Edge cases**:
- sqlite-vec is pre-v1 — API surface may change. Pin version in Cargo.toml and handle breaking changes in package updates.
- The `vec0` virtual table requires the extension to be loaded. The Rust adapter calls `sqlite3_auto_extension` or `sqlite-vec`'s load function at app init.
- WASM test adapter is a fallback if the Node.js native binding has platform issues — but `better-sqlite3` is already a test dependency and `sqlite-vec` npm works with it.

---

## R2: EPUB Parser Library

### Decision: `epub2` (npm) for EPUB parsing

**Rationale**: `epub2` (v0.x) is a pure JavaScript EPUB parser — extracts spine items in order, TOC, metadata, and chapter text. No native deps, works in the Tauri webview and Node.js tests. Licensed MIT. Lightweight (~30KB). Extracts text from XHTML spine items, strips HTML tags, and provides TOC structure for heading-aware chunking.

**Alternatives considered**:
- `epubjs` / `epub.js`: focused on rendering EPUBs in the browser (iframe-based). Overkill — we only need text extraction, not pagination or styling.
- `@gxl/epub-parser`: newer, well-maintained, but less established in the ecosystem.
- `adm-zip` + manual XML parsing: works but requires `jszip` or `adm-zip` + custom XHTML parsing. `epub2` does all of this out of the box.

**EPUB → chunk pipeline**:
1. Load EPUB file from `appLocalData/resources/<id>/<file>` via `VaultFs.readFile` (or direct `fs` through the Resource path — Resources live outside the vault).
2. Parse with `epub2`: get `spine` (ordered items) and `toc` (chapter structure).
3. For each spine item: extract text content, strip HTML tags, normalize whitespace.
4. Map spine items to TOC entries for locator metadata.
5. Feed text through the chunker (reuse Markdown chunker with TOC-based splitting).

**Locked: `epub2` for EPUB parsing.**

**Edge cases**:
- DRM-protected EPUBs: `epub2` cannot decrypt — surface "cannot read this file" message.
- EPUBs with no TOC: fall back to spine-item boundaries for chunking.
- Image-heavy sections: text content may be empty — skip, increment warning count.
- Large EPUBs (>10MB): chunk in streaming fashion (spine item by spine item) to avoid loading the whole file into memory.

---

## R3: Content Hashing for Incremental Re-ingestion

### Decision: SHA-256 via Web Crypto API (`crypto.subtle.digest`)

**Rationale**: Content-hash incremental re-ingestion (Q3 answer) requires computing a deterministic hash of each chunk's text content. SHA-256 via the Web Crypto API is:
- **Available everywhere**: Browser (Tauri webview), Node.js (v15+), Deno.
- **Collision-resistant for this scale**: SHA-256 is cryptographically strong — overkill for a few thousand chunks, but zero false positives.
- **No npm dep**: The Web Crypto API is built-in.
- **Deterministic**: Same text → same hash, every time. UTF-8 encoding ensures consistency.

**Flow**:
1. After chunking → compute `hash = SHA-256(chunk.text)` for each chunk.
2. On insert: store `content_hash` in `chunks.content_hash`.
3. On re-ingestion: chunk the new file → compute hashes → for each new chunk, check if a chunk with matching `content_hash` + same `source_id` + same `source_kind` already exists.
   - **Match** → keep existing embedding, update `chunk_index` and offset if shifted.
   - **No match** → new or modified chunk → embed + insert.
4. Delete chunks that no longer appear (in transaction, after embedding is confirmed — FR-012 atomicity).

**Storage**: `chunks.content_hash TEXT NOT NULL` (64-char hex string).

**Edge cases**:
- Hash collision (theoretically impossible with SHA-256 — practically never).
- Embedding model changes: if the user switches from Ollama to OpenAI embeddings, all chunks need re-embedding because the vector space is different. This is a future concern — not addressed in v1. The content hash tracks text identity, not embedding identity.
- Re-chunking changes boundaries: a heading renamed from "Foo" to "Bar" creates a "new" chunk because the text (including heading) has changed. This is correct behavior — the chunk's semantic content actually changed.

**Locked: SHA-256 via Web Crypto API. `chunks.content_hash` column.**

---

## R4: Embedding Dimension Handling

### Decision: Runtime-discovered, stored per chunk batch

**Rationale**: Different embedding providers return different vector dimensions (Ollama nomic-embed-text: 768, OpenAI text-embedding-3-small: 1536). The system must handle this without hardcoding dimensions.

**Approach**:
- After the first batch embed, capture the dimension from the returned vector and store as a runtime constant for the ingestion session.
- sqlite-vec's `vec0` virtual table is dimension-agnostic — it stores variable-length float32 arrays. No schema migration needed when dimensions change.
- Cross-vault: different vaults may use different embedding providers → different dimensions. The `vec0` table is vault-scoped (via JOIN on `chunks.vault_id`), so mixed dimensions in the same DB are fine.
- Query embedding uses the same router → same dimension as stored vectors.

**Not stored in schema**: Dimensions are implicit in the vector blobs. If needed for debugging, capture in `chunks.embedding_dim` (nullable column for future use).

**Locked: Runtime dimension discovery. No hardcoded dimensions.**

---

## R5: Test Adapter Strategy

### Decision: Node.js adapter using `sqlite-vec` npm + `better-sqlite3`

**Rationale**: The existing test pattern for DB operations uses `better-sqlite3` with in-memory SQLite databases. The Node.js adapter for `VectorStore` wraps `sqlite-vec` npm (which already integrates with `better-sqlite3`). Tests run without Tauri or Rust — pure Node.js.

**Test categories**:
1. **VectorStore contract tests** — same test suite run against both adapters (Node commit, Tauri skipped in CI until E2E).
2. **Chunker unit tests** — pure functions: Markdown string → `Chunk[]`, EPUB file → `Chunk[]`. No DB needed.
3. **Ingestor integration tests** — orchestrate the full pipeline (chunk → embed → store) with a fake embedding provider that returns deterministic vectors.
4. **Retriever integration tests** — insert known chunks with known vectors, query, verify results.
5. **Note indexer tests** — mock `VaultReader`, verify chunk/embed/store calls, verify vault rescan cleanup.

**Mock embedding provider**: For tests, inject a fake `router.embed` that returns vectors of length 4 with chunk-text-derived values (e.g., hash-to-vector). This makes retrieval tests deterministic and testable without a real LLM server.

**Locked: Node.js adapter with `sqlite-vec` npm. Fake embedding provider for test determinism.**

---

## R6: Migration m0009 Schema Design

### Decision: Additive migration adding `chunks`, `resource_map`, and `indexed_notes` tables

**Tables**:

```sql
-- Chunks table (metadata + reference)
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,                  -- UUID
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('resource', 'note')),
  source_id TEXT NOT NULL,              -- resources.id or vault note path
  source_title TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading_path TEXT,                    -- e.g., "Chapter 1 > Section 1.2"
  text_content TEXT NOT NULL,
  content_hash TEXT NOT NULL,           -- SHA-256 hex
  char_offset_start INTEGER NOT NULL,
  char_offset_end INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_kind, source_id, chunk_index)
);

-- Chunk embeddings (sqlite-vec virtual table)
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  chunk_id TEXT,                        -- references chunks.id
  embedding FLOAT[1024]                 -- dynamic dimension, 1536 for gte-small
);

-- Resource map (links chunks to Resources + optional Milestones)
CREATE TABLE resource_map (
  id TEXT PRIMARY KEY,                  -- UUID
  chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  locator TEXT NOT NULL                 -- heading/TOC path
);

-- Indexed notes tracking (which vault notes are in the corpus)
CREATE TABLE indexed_notes (
  id TEXT PRIMARY KEY,                  -- UUID
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  note_path TEXT NOT NULL,              -- relative path in vault
  title TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  last_indexed_at TEXT NOT NULL,
  UNIQUE(vault_id, note_path)
);

CREATE INDEX idx_chunks_vault ON chunks(vault_id);
CREATE INDEX idx_chunks_source ON chunks(source_kind, source_id);
CREATE INDEX idx_resource_map_resource ON resource_map(resource_id);
CREATE INDEX idx_resource_map_milestone ON resource_map(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX idx_indexed_notes_vault ON indexed_notes(vault_id);
```

**Design notes**:
- `chunks.source_kind` discriminates `resource` (imported literature) from `note` (personal vault note) — required for source-kind tagging (FR-021).
- `chunks.source_id` is polymorphic: for Resources it's `resources.id`, for notes it's the vault-relative file path.
- `chunks_vec` uses the `vec0` virtual table from sqlite-vec — stores embedding blobs. Joined to `chunks` via `chunk_id` on KNN search.
- `resource_map` links chunks to Resources and optionally to Milestones (FR-015 — milestone association deferred to F10.3).
- `indexed_notes` tracks which vault notes are in the corpus — enables vault rescan cleanup (FR-029) and the "Index this note" state toggle.
- `content_hash` enables incremental re-ingestion (FR-017).
- No `source_note_path` column in `chunks` — `source_id` + `source_kind` is the discriminator, keeping the table normalized.

**Locked: m0009 schema as above. Additive only. Sequential after m0008 (Projects).**

---

## R7: No New npm Dependencies (Beyond sqlite-vec + epub2)

### Decision: Plain TypeScript for Markdown chunking, no parser library

**Rationale**: Markdown chunking is heading-based splitting — no AST needed. Detect `#` lines via regex, split at heading boundaries, group content under headings. This is ~50 lines of pure TypeScript. Adding a Markdown parser library (e.g., `remark`) adds weight for no benefit at v1.

**Existing deps reused**:
- `crypto.subtle.digest('SHA-256', …)` — Web Crypto API, built-in.
- `zod` — existing, used for chunk validation.
- `@tauri-apps/api` — existing, used for `invoke` calls to RAG Rust commands.
- `tauri-plugin-http` — existing (016), used for embedding API calls via the router.

**New deps**:
- `sqlite-vec` (npm, dev only for tests — Tauri uses the Rust crate)
- `epub2` (npm, for EPUB parsing in P3)

**Locked: No Markdown parser library. Heading-based regex splitting.**
