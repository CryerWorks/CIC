/**
 * useRAG hook (Feature 017). Consumed by UI features — ingest Resources, search,
 * index notes. Wraps the chunk → embed → store pipeline through the VectorStore
 * seam. Features never import vector store internals directly.
 */
import { useCallback, useMemo, useState } from "react";
import { useDb } from "../../../app/providers/DbProvider";
import { useActiveVaultId } from "../../../app/providers/VaultProvider";
import { useAIRouter } from "../../../app/providers/AIProvider";
import { useVectorStore } from "../../../app/providers/RAGProvider";
import { setResourceIngested, clearResourceIngested, getResource } from "../../../db";
import { chunkMarkdown } from "../chunker/markdown";
import { chunkEpub, parseEpub } from "../chunker/epub";
import { embedChunks } from "../embedder";
import { hashContent } from "../hashing";
import { createRetriever } from "../retriever";
import { indexNote, unindexNote, isNoteIndexed, getIndexedNotes } from "../noteIndexer";
import type { IngestResult, IngestState, SearchFilter, SearchResult, SourceStats } from "../types";

let _readResourceFile: ((resourceId: string) => Promise<string>) | null = null;
function getReadResourceFile(): (resourceId: string) => Promise<string> {
  if (!_readResourceFile) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readResourceFile } = require("../adapters/rag/tauri");
    _readResourceFile = readResourceFile;
  }
  return _readResourceFile!;
}

export function useRAG() {
  const db = useDb();
  const vaultId = useActiveVaultId();
  const router = useAIRouter();
  const vectorStore = useVectorStore();
  const [inProgress, setInProgress] = useState<IngestState | null>(null);

  const retriever = useMemo(
    () => createRetriever(router, vectorStore),
    [router, vectorStore],
  );

  const ingestMarkdownResource = useCallback(
    async (resourceId: string): Promise<IngestResult> => {
      if (!vaultId) throw new Error("No vault connected");

      const resource = await getResource(db, resourceId);
      if (!resource) throw new Error(`Resource ${resourceId} not found`);

      const startedAt = new Date().toISOString();
      setInProgress({
        type: "resource",
        sourceTitle: resource.title,
        status: "parsing",
        progress: { current: 0, total: 0 },
      });

      try {
        setInProgress((s) => s ? { ...s, status: "parsing" } : null);
        const fileContent = await getReadResourceFile()(resourceId);

        setInProgress((s) => s ? { ...s, status: "chunking" } : null);
        const doc = chunkMarkdown(fileContent, "resource", resourceId, resource.title, vaultId);

        // Compute content hashes for incremental re-ingestion
        for (const c of doc.chunks) {
          c.contentHash = await hashContent(c.textContent);
        }

        let skippedCount = 0;
        const existing = new Set(await vectorStore.getSourceHashes("resource", resourceId));

        const changed = doc.chunks.filter((c) => {
          if (existing.has(c.contentHash)) {
            skippedCount++;
            return false;
          }
          return true;
        });

        const total = changed.length;
        let apiCalls = 0;
        if (total > 0) {
          setInProgress((s) => s ? { ...s, status: "embedding", progress: { current: 0, total } } : null);
          const embedResult = await embedChunks(changed, router);
          apiCalls = embedResult.apiCalls;
          await vectorStore.deleteBySource("resource", resourceId);
          setInProgress((s) => s ? { ...s, status: "storing", progress: { current: 0, total } } : null);
          await vectorStore.insertChunks(embedResult.chunks);
        } else if (doc.chunks.length === 0) {
          await vectorStore.deleteBySource("resource", resourceId);
        }

        await setResourceIngested(db, resourceId);

        setInProgress({ type: "resource", sourceTitle: resource.title, status: "done", progress: { current: doc.chunks.length, total: doc.chunks.length } });

        return {
          sourceId: resourceId,
          sourceTitle: resource.title,
          chunkCount: doc.chunks.length,
          ingestedAt: startedAt,
          skippedCount,
          apiCalls,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown ingestion error";
        setInProgress({ type: "resource", sourceTitle: resource.title, status: "error", progress: { current: 0, total: 0 }, error: msg });
        throw e;
      }
    },
    [db, vaultId, router, vectorStore],
  );

  const ingestEpubResource = useCallback(
    async (resourceId: string): Promise<IngestResult> => {
      if (!vaultId) throw new Error("No vault connected");

      const resource = await getResource(db, resourceId);
      if (!resource) throw new Error(`Resource ${resourceId} not found`);
      if (!resource.file_path) throw new Error("Resource has no attached file");

      const startedAt = new Date().toISOString();
      setInProgress({
        type: "resource",
        sourceTitle: resource.title,
        status: "parsing",
        progress: { current: 0, total: 0 },
      });

      try {
        setInProgress((s) => s ? { ...s, status: "parsing" } : null);
        const parsed = await parseEpub(resource.file_path!);

        setInProgress((s) => s ? { ...s, status: "chunking" } : null);
        const doc = chunkEpub(parsed, resourceId, vaultId);

        // Compute content hashes for incremental re-ingestion
        for (const c of doc.chunks) {
          c.contentHash = await hashContent(c.textContent);
        }

        const existing = new Set(await vectorStore.getSourceHashes("resource", resourceId));

        let skippedCount = 0;
        const changed = doc.chunks.filter((c) => {
          if (existing.has(c.contentHash)) { skippedCount++; return false; }
          return true;
        });

        let apiCalls = 0;
        if (changed.length > 0) {
          setInProgress((s) => s ? { ...s, status: "embedding", progress: { current: 0, total: changed.length } } : null);
          const embedResult = await embedChunks(changed, router);
          apiCalls = embedResult.apiCalls;
          await vectorStore.deleteBySource("resource", resourceId);
          setInProgress((s) => s ? { ...s, status: "storing", progress: { current: 0, total: changed.length } } : null);
          await vectorStore.insertChunks(embedResult.chunks);
        } else if (doc.chunks.length === 0) {
          await vectorStore.deleteBySource("resource", resourceId);
        }

        await setResourceIngested(db, resourceId);

        setInProgress({
          type: "resource", sourceTitle: parsed.title,
          status: "done", progress: { current: doc.chunks.length, total: doc.chunks.length },
        });

        return {
          sourceId: resourceId, sourceTitle: parsed.title,
          chunkCount: doc.chunks.length, ingestedAt: startedAt, skippedCount, apiCalls,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown ingestion error";
        setInProgress({
          type: "resource", sourceTitle: resource.title,
          status: "error", progress: { current: 0, total: 0 }, error: msg,
        });
        throw e;
      }
    },
    [db, vaultId, router, vectorStore],
  );

  const search = useCallback(
    async (query: string, k = 10, filter?: SearchFilter): Promise<SearchResult[]> => {
      if (!vaultId) throw new Error("No vault connected");
      return retriever.search(query, k, vaultId, filter);
    },
    [vaultId, retriever],
  );

  const getSourceStats = useCallback(
    async (): Promise<SourceStats[]> => {
      if (!vaultId) throw new Error("No vault connected");
      return retriever.getSourceStats(vaultId);
    },
    [vaultId, retriever],
  );

  const getChunkCount = useCallback(
    async (): Promise<number> => {
      if (!vaultId) throw new Error("No vault connected");
      return retriever.getChunkCount(vaultId);
    },
    [vaultId, retriever],
  );

  const unindexResource = useCallback(
    async (resourceId: string): Promise<void> => {
      if (!vaultId) throw new Error("No vault connected");
      await vectorStore.deleteBySource("resource", resourceId);
      await clearResourceIngested(db, resourceId);
    },
    [db, vaultId, vectorStore],
  );

  const indexVaultNote = useCallback(
    async (notePath: string, title: string, noteContent: string): Promise<IngestResult> => {
      if (!vaultId) throw new Error("No vault connected");
      return indexNote({ noteContent, notePath, title, vaultId, db, vectorStore, router });
    },
    [db, vaultId, router, vectorStore],
  );

  const unindexVaultNote = useCallback(
    async (notePath: string): Promise<void> => {
      if (!vaultId) throw new Error("No vault connected");
      await unindexNote(db, vectorStore, vaultId, notePath);
    },
    [db, vaultId, vectorStore],
  );

  const checkNoteIndexed = useCallback(
    async (notePath: string): Promise<boolean> => {
      if (!vaultId) return false;
      return isNoteIndexed(db, vaultId, notePath);
    },
    [db, vaultId],
  );

  const fetchIndexedNotes = useCallback(
    async (): Promise<Array<{ notePath: string; title: string; chunkCount: number; lastIndexedAt: string }>> => {
      if (!vaultId) throw new Error("No vault connected");
      return getIndexedNotes(db, vaultId);
    },
    [db, vaultId],
  );

  return {
    ingestMarkdownResource,
    ingestEpubResource,
    unindexResource,
    indexVaultNote,
    unindexVaultNote,
    checkNoteIndexed,
    fetchIndexedNotes,
    search,
    getSourceStats,
    getChunkCount,
    inProgress,
  };
}
