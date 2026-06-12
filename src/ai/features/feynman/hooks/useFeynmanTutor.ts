/**
 * useFeynmanTutor hook (Feature 018). Wraps FeynmanTutorImpl in React state management.
 * Features consume this hook — never import FeynmanTutorImpl directly (Constitution IV).
 *
 * Phase 4: Real gap writer and store are wired here — VaultWriter from the active vault and
 * insertGaps from the DB repository.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useAIRouter } from "../../../../app/providers/AIProvider";
import { useVectorStore } from "../../../../app/providers/RAGProvider";
import { useActiveVaultId, useVaultState } from "../../../../app/providers/VaultProvider";
import { useDbState } from "../../../../app/providers/DbProvider";
import { createRetriever } from "../../../rag/retriever";
import { FeynmanTutorImpl } from "../tutorImpl";
import { writeGapsToVault } from "../../../../features/feynman/gapWriter";
import { insertGaps } from "../../../../db";
import type { FeynmanGap, FeynmanMessage, GapSaveTarget } from "../types";

export function useFeynmanTutor(scope?: { courseId?: string }) {
  const router = useAIRouter();
  const vectorStore = useVectorStore();
  const vaultId = useActiveVaultId();
  const vaultState = useVaultState();
  const dbState = useDbState();
  const db = dbState.status === "ready" ? dbState.db : null;
  const [messages, setMessages] = useState<FeynmanMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  // Retriever: embeds query strings then searches vector store.
  const retriever = useMemo(() => createRetriever(router, vectorStore), [router, vectorStore]);

  // Gap writer: writes gaps to the vault via VaultWriter.
  const gapWriter = useMemo(() => {
    const vault = vaultState.status === "ready" ? vaultState.vault : null;
    return {
      writeGaps: async (gaps: FeynmanGap[], target: GapSaveTarget) => {
        if (!vault) return;
        await writeGapsToVault(gaps, target, vault.writer);
      },
    };
  }, [vaultState]);

  // Gap store: writes gaps to the SQLite feynman_gaps table.
  const gapStore = useMemo(
    () => ({
      insertGaps: async (rows: Array<{ id: string; vaultId: string; courseId: string | null; notePath: string; text: string }>) => {
        if (!vaultId || !db) return;
        await insertGaps(db, rows);
      },
    }),
    [db, vaultId],
  );

  // Search function: maps retriever results (snake_case ChunkRow) to SearchFn (camelCase).
  const searchFn = useCallback(
    async (query: string, k = 5) => {
      if (!vaultId) return [];
      try {
        const results = await retriever.search(query, k, vaultId);
        return results.map((r) => ({
          chunk: {
            sourceTitle: r.chunk.source_title,
            textContent: r.chunk.text_content,
            headingPath: r.chunk.heading_path ?? null,
            sourceKind: r.chunk.source_kind,
            sourceId: r.chunk.source_id,
          },
          distance: r.distance,
          resourceId: r.resourceId ?? null,
          locator: r.locator ?? "",
        }));
      } catch {
        return [];
      }
    },
    [retriever, vaultId],
  );

  // Stable tutor instance — re-created when dependencies change.
  const tutor = useMemo(() => {
    return new FeynmanTutorImpl(router, searchFn, vaultId ?? "", gapWriter, gapStore);
  }, [router, searchFn, vaultId, gapWriter, gapStore]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!vaultId) {
        setError("No vault connected. Connect a vault to use the Feynman Tutor.");
        return;
      }
      setError(null);

      // Start conversation with the current scope
      tutor.startConversation(scopeRef.current);

      try {
        const iter = tutor.sendMessage(text);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of iter) {
          setMessages(tutor.getMessages());
        }
        // Final state sync
        setMessages(tutor.getMessages());
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to send message";
        setError(msg);
      }
    },
    [vaultId, tutor],
  );

  const summarizeGaps = useCallback(async (): Promise<FeynmanGap[]> => {
    try {
      if (!tutor.getMessages().length) return [];
      return await tutor.summarizeGaps();
    } catch {
      return [];
    }
  }, [tutor]);

  const saveGaps = useCallback(
    async (gaps: FeynmanGap[], target: GapSaveTarget): Promise<number> => {
      if (!vaultId) return 0;
      try {
        return await tutor.saveGaps(gaps, target);
      } catch {
        return 0;
      }
    },
    [vaultId, tutor],
  );

  const reset = useCallback(() => {
    tutor.startConversation(scopeRef.current);
    setMessages([]);
    setError(null);
  }, [tutor]);

  return {
    messages,
    isActive: tutor.isActive,
    error,
    sendMessage,
    summarizeGaps,
    saveGaps,
    reset,
  };
}
