import type { ChunkInput, SearchFilter, SearchResult, SourceStats } from "./types";

/**
 * VectorStore — the seam between the RAG pipeline and the concrete vector
 * database (sqlite-vec). Follows the existing seam pattern of SqlExecutor,
 * VaultFs, and SecretStore: the interface is small and technology-agnostic;
 * the adapters are deep.
 *
 * Feature 017 — two adapters:
 *   - Tauri (production): calls Rust custom commands via `invoke()`
 *   - Node.js (tests): uses `sqlite-vec` npm + `better-sqlite3` directly
 */
export interface VectorStore {
  /**
   * Initialize sqlite-vec extension for the current DB connection.
   * MUST be called once per app boot, before any other method.
   * Idempotent — safe to call multiple times.
   */
  init(): Promise<void>;

  /**
   * Batch insert chunks with their embeddings.
   * Chunks are inserted into the `chunks` table, their embeddings into
   * the `chunks_vec` sqlite-vec virtual table, and resource_map rows
   * for chunks with source_kind='resource'.
   * @returns count of chunks inserted
   */
  insertChunks(chunks: ChunkInput[]): Promise<number>;

  /**
   * Delete all chunks for a given source.
   * Cascade removes from chunks_vec and resource_map.
   * Used on re-ingestion and Resource/note deletion.
   */
  deleteBySource(sourceKind: "resource" | "note", sourceId: string): Promise<number>;

  /**
   * Search for the top-k most similar chunks to a query vector.
   * Performs exact KNN via sqlite-vec MATCH on the vec0 virtual table,
   * joined back to chunks for metadata.
   */
  search(queryVector: Float32Array, k: number, vaultId: string, filter?: SearchFilter): Promise<SearchResult[]>;

  /**
   * Get statistics for all indexed sources in the active vault.
   */
  getSourceStats(vaultId: string): Promise<SourceStats[]>;

  /**
   * Get the total number of chunks across all sources in a vault.
   */
  getChunkCount(vaultId: string): Promise<number>;

  /**
   * Get all content hashes for a source — used for incremental re-ingestion.
   * Returns a set of SHA-256 hex strings for existing chunks.
   */
  getSourceHashes(sourceKind: "resource" | "note", sourceId: string): Promise<string[]>;
}
