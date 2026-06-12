import { createContext, useContext, type ReactNode } from "react";
import type { VectorStore } from "../../ai/rag/vectorStore";

/** Feature 017 — RAG composition root. Production injects the Tauri VectorStore adapter;
 *  tests inject a Node adapter. Mirrors SourceFilesProvider DI pattern. */
const VectorStoreContext = createContext<VectorStore | null>(null);

export function RAGProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: VectorStore;
}) {
  return <VectorStoreContext.Provider value={store}>{children}</VectorStoreContext.Provider>;
}

/** The active VectorStore seam. Throws if RAGProvider is not in the tree. */
export function useVectorStore(): VectorStore {
  const ctx = useContext(VectorStoreContext);
  if (!ctx) throw new Error("useVectorStore must be used within a <RAGProvider>");
  return ctx;
}
