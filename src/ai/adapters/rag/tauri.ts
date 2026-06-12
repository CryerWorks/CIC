/**
 * Tauri VectorStore adapter — production implementation.
 * All vector operations route through custom Rust commands via `invoke()`.
 * The Rust side (`src-tauri/src/rag.rs`) handles sqlite-vec operations
 * natively on the SQLite connection.
 *
 * ESLint boundary: this file and src/ai/adapters/rag/node.ts are the only
 * files allowed to interact with sqlite-vec internals (and the Tauri bridge).
 */
import { invoke } from "@tauri-apps/api/core";
import type { VectorStore } from "../../rag/vectorStore";
import type { ChunkInput, SearchResult, SearchFilter, SourceStats } from "../../rag/types";

export function createTauriVectorStore(): VectorStore {
  return {
    init(): Promise<void> {
      return invoke("rag_init");
    },

    insertChunks(chunks: ChunkInput[]): Promise<number> {
      return invoke<number>("rag_insert_chunks", {
        chunks: chunks.map((c) => ({
          ...c,
          embedding: Array.from(c.embedding), // Float32Array → number[]
        })),
      });
    },

    deleteBySource(sourceKind: "resource" | "note", sourceId: string): Promise<number> {
      return invoke<number>("rag_delete_by_source", { sourceKind, sourceId });
    },

    search(
      queryVector: Float32Array,
      k: number,
      vaultId: string,
      filter?: SearchFilter,
    ): Promise<SearchResult[]> {
      return invoke<SearchResult[]>("rag_search", {
        queryVector: Array.from(queryVector),
        k,
        vaultId,
        filter: filter ?? null,
      });
    },

    getSourceStats(vaultId: string): Promise<SourceStats[]> {
      return invoke<SourceStats[]>("rag_get_source_stats", { vaultId });
    },

    getChunkCount(vaultId: string): Promise<number> {
      return invoke<number>("rag_get_chunk_count", { vaultId });
    },

    getSourceHashes(sourceKind: "resource" | "note", sourceId: string): Promise<string[]> {
      return invoke<string[]>("rag_get_source_hashes", { sourceKind, sourceId });
    },
  };
}

/** Read the text content of a stored resource file (Feature 017). */
export async function readResourceFile(resourceId: string): Promise<string> {
  return invoke<string>("rag_read_resource_file", { resourceId });
}
