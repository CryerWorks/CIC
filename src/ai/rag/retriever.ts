import type { AIRouter } from "../router";
import type { VectorStore } from "./vectorStore";
import type { SearchFilter, SearchResult, SourceStats } from "./types";

export interface Retriever {
  search(query: string, k: number, vaultId: string, filter?: SearchFilter): Promise<SearchResult[]>;
  getSourceStats(vaultId: string): Promise<SourceStats[]>;
  getChunkCount(vaultId: string): Promise<number>;
}

export function createRetriever(router: AIRouter, store: VectorStore): Retriever {
  return {
    async search(query, k, vaultId, filter) {
      const result = await router.embed("embeddings", [query], {
        containsVaultContent: false,
      });
      const queryVector = new Float32Array(result.vectors[0]);
      return store.search(queryVector, k, vaultId, filter);
    },

    async getSourceStats(vaultId) {
      return store.getSourceStats(vaultId);
    },

    async getChunkCount(vaultId) {
      return store.getChunkCount(vaultId);
    },
  };
}
