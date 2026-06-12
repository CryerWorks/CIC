import type { VectorStore } from "../../ai/rag/vectorStore";

/** No-op VectorStore for tests that don't exercise RAG operations.
 *  All methods return empty/zero results. */
export const noopVectorStore: VectorStore = {
  init: () => Promise.resolve(),
  insertChunks: () => Promise.resolve(0),
  deleteBySource: () => Promise.resolve(0),
  search: () => Promise.resolve([]),
  getSourceStats: () => Promise.resolve([]),
  getChunkCount: () => Promise.resolve(0),
  getSourceHashes: () => Promise.resolve([]),
};
