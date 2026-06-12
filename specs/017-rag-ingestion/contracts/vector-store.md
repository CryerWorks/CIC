# Interface Contract: VectorStore

**Feature**: 017-rag-ingestion | **Serves**: ingest, retrieve, search, note-index

## Purpose

The `VectorStore` interface is the seam between the RAG pipeline (`src/ai/rag/`) and the concrete vector database (sqlite-vec via Rust or Node.js). It follows the existing seam pattern of `SqlExecutor`, `VaultFs`, and `SecretStore` — the interface is small and technology-agnostic; the adapters are deep.

## Contract

```ts
// src/ai/rag/vectorStore.ts

export interface ChunkInput {
  /** UUID for the chunk */
  id: string;
  /** Vault scope */
  vaultId: string;
  /** Discriminates Resource vs vault note */
  sourceKind: 'resource' | 'note';
  /** resources.id for Resources, vault-relative path for notes */
  sourceId: string;
  /** Display name */
  sourceTitle: string;
  /** Sequential position within the source */
  chunkIndex: number;
  /** Structural locator (heading/TOC path) */
  headingPath: string | null;
  /** Chunk text content */
  textContent: string;
  /** SHA-256 hex of textContent */
  contentHash: string;
  /** Start offset in source file */
  charOffsetStart: number;
  /** End offset in source file */
  charOffsetEnd: number;
  /** Float32 embedding vector */
  embedding: Float32Array;
}

export interface ChunkRow extends Omit<ChunkInput, 'embedding'> {
  createdAt: string;
}

export interface SearchFilter {
  /** Filter by source kind */
  sourceKind?: 'resource' | 'note';
  /** Filter by Resource ID (only when sourceKind='resource') */
  resourceId?: string;
  /** Filter by Course ID (via resource_map.milestone_id → milestones.course_id) */
  courseId?: string;
}

export interface SearchResult {
  /** Matching chunk metadata */
  chunk: ChunkRow;
  /** Cosine distance (lower = more similar) */
  distance: number;
  /** Resource ID (null for notes) — for citation linking */
  resourceId: string | null;
  /** Milestone ID (null for notes or unlinked) */
  milestoneId: string | null;
  /** Locator string from resource_map (heading/TOC path) */
  locator: string;
}

export interface SourceStats {
  sourceKind: 'resource' | 'note';
  sourceId: string;
  sourceTitle: string;
  chunkCount: number;
  lastUpdated: string;
}

export interface VectorStore {
  /**
   * Initialize sqlite-vec extension for the current DB connection.
   * MUST be called once per app boot, before any other method.
   * Idempotent — safe to call multiple times.
   */
  init(): Promise<void>;

  /**
   * Batch insert chunks with their embeddings.
   * Chunks are inserted into the `chunks` table and their embeddings
   * into the `chunks_vec` sqlite-vec virtual table.
   * For Resource chunks, also inserts into `resource_map`.
   * @returns count of chunks inserted
   */
  insertChunks(chunks: ChunkInput[]): Promise<number>;

  /**
   * Delete all chunks for a given source.
   * Cascade removes from chunks_vec and resource_map.
   * Used on re-ingestion (before inserting new chunks) and Resource/note deletion.
   * @param sourceKind discriminates Resource vs Note
   * @param sourceId the source identifier
   */
  deleteBySource(sourceKind: 'resource' | 'note', sourceId: string): Promise<number>;

  /**
   * Search for the top-k most similar chunks to a query vector.
   * Performs exact KNN via sqlite-vec MATCH on the vec0 virtual table.
   * @param queryVector Float32Array embedding of the query text
   * @param k number of results to return (default 10)
   * @param filter optional filters (sourceKind, resourceId, courseId)
   * @returns results ordered by ascending distance
   */
  search(queryVector: Float32Array, k?: number, filter?: SearchFilter): Promise<SearchResult[]>;

  /**
   * Get statistics for all indexed sources in the active vault.
   * @param vaultId scope to active vault
   * @returns list of sources with chunk counts and last-updated timestamps
   */
  getSourceStats(vaultId: string): Promise<SourceStats[]>;

  /**
   * Get the total number of chunks across all sources.
   * @param vaultId scope to active vault
   */
  getChunkCount(vaultId: string): Promise<number>;
}
```

## Adapter Contract

### Tauri Adapter (`src/ai/adapters/rag/tauri.ts`)

```ts
import { invoke } from '@tauri-apps/api/core';
import type { VectorStore, ChunkInput, SearchResult, SearchFilter, SourceStats } from '../../rag/vectorStore';

export function createTauriVectorStore(): VectorStore {
  return {
    init: () => invoke('rag_init'),

    insertChunks: (chunks) => invoke<number>('rag_insert_chunks', { chunks }),

    deleteBySource: (sourceKind, sourceId) =>
      invoke<number>('rag_delete_by_source', { sourceKind, sourceId }),

    search: (queryVector, k = 10, filter) =>
      invoke<SearchResult[]>('rag_search', {
        queryVector: Array.from(queryVector),
        k,
        filter: filter ?? null,
      }),

    getSourceStats: (vaultId) => invoke<SourceStats[]>('rag_get_source_stats', { vaultId }),

    getChunkCount: (vaultId) => invoke<number>('rag_get_chunk_count', { vaultId }),
  };
}
```

### Node Test Adapter (`src/ai/adapters/rag/node.ts`)

```ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { VectorStore, ChunkInput, SearchResult, SearchFilter, SourceStats } from '../../rag/vectorStore';

export function createNodeVectorStore(db: Database.Database): VectorStore {
  // Uses better-sqlite3 + sqlite-vec npm package directly
  // sqliteVec.load(db) attaches the extension
  // INSERT INTO chunks_vec (chunk_id, embedding) VALUES (?, vec_f32(?))
  // SELECT ... FROM chunks_vec WHERE embedding MATCH vec_f32(?) ORDER BY distance LIMIT ?
  // Returns the interface implementation
}
```

## Rust Command Contract (`src-tauri/src/rag.rs`)

```rust
// Commands exposed to the Tauri webview:

#[tauri::command]
fn rag_init(db: tauri::State<SqlitePool>) -> Result<(), String> { /* ... */ }

#[tauri::command]
fn rag_insert_chunks(
    db: tauri::State<SqlitePool>,
    chunks: Vec<ChunkInput>,
) -> Result<u32, String> { /* ... */ }

#[tauri::command]
fn rag_delete_by_source(
    db: tauri::State<SqlitePool>,
    source_kind: String,
    source_id: String,
) -> Result<u32, String> { /* ... */ }

#[tauri::command]
fn rag_search(
    db: tauri::State<SqlitePool>,
    query_vector: Vec<f32>,
    k: usize,
    filter: Option<SearchFilter>,
) -> Result<Vec<SearchResult>, String> { /* ... */ }

#[tauri::command]
fn rag_get_source_stats(
    db: tauri::State<SqlitePool>,
    vault_id: String,
) -> Result<Vec<SourceStats>, String> { /* ... */ }

#[tauri::command]
fn rag_get_chunk_count(
    db: tauri::State<SqlitePool>,
    vault_id: String,
) -> Result<u32, String> { /* ... */ }
```

## RAG Hook Contract

```ts
// src/ai/rag/hooks/useRAG.ts

export interface UseRAG {
  /** Ingest a Resource file (parse → chunk → embed → store) */
  ingestResource(resourceId: string): Promise<IngestResult>;

  /** Ingest an EPUB Resource (same pipeline, different parser) */
  ingestEpub(resourceId: string): Promise<IngestResult>;

  /** Index a vault note */
  indexNote(notePath: string): Promise<IngestResult>;

  /** Remove a note from the index */
  unindexNote(notePath: string): Promise<void>;

  /** Search the corpus — returns SearchResult[] consumable by UI and downstream features */
  search(query: string, k?: number, filter?: SearchFilter): Promise<SearchResult[]>;

  /** Get indexed sources with stats */
  getSourceStats(): Promise<SourceStats[]>;

  /** Total chunk count for the active vault */
  getChunkCount(): Promise<number>;

  /** Whether a specific note is indexed */
  isNoteIndexed(notePath: string): Promise<boolean>;

  /** Currently running operation, if any */
  inProgress: IngestState | null;
}

export interface IngestResult {
  sourceId: string;
  sourceTitle: string;
  chunkCount: number;
  ingestedAt: string;
  /** Chunks skipped (unchanged) during incremental re-ingestion */
  skippedCount: number;
}

export interface IngestState {
  type: 'resource' | 'note';
  sourceTitle: string;
  status: 'parsing' | 'chunking' | 'embedding' | 'storing' | 'done' | 'error';
  progress: { current: number; total: number };
  error?: string;
}
```

## Invariants

1. **Vault scoping**: All queries MUST filter by `chunks.vault_id`. Cross-vault chunk leakage is a data-integrity violation.
2. **Atomic ingestion**: A failed embed batch MUST roll back the entire ingestion — the Resource retains its previous `ingested_at` and chunks (FR-012).
3. **Lockdown gate**: Before any embedding call, check `config.lockdown`. If ON and the effective provider resolves to remote → throw `ProviderError('lockdown')` — no data leaves the machine (FR-011).
4. **Content hash dedup**: On re-ingestion, chunks with unchanged `content_hash` MUST NOT trigger embedding calls (FR-017).
5. **Source-kind consistency**: A chunk with `source_kind='resource'` MUST have a corresponding `resource_map` row. A chunk with `source_kind='note'` MUST NOT have a `resource_map` row but MUST have an `indexed_notes` row.
