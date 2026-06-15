/**
 * useBlueprint hook — wraps BlueprintGeneratorImpl + RAG + materialization in
 * React state management. Features consume this hook — never import the generator
 * or materializer directly (Constitution IV).
 *
 * Manages the full blueprint lifecycle:
 *   idle → target-setting → generating (Mode A or B) → reviewing → materializing → done
 */

import { useCallback, useMemo, useState } from "react";
import { useAIRouter } from "../../app/providers/AIProvider";
import { useRAG } from "../../ai/rag/hooks/useRAG";
import { useActiveVaultId, useVaultState } from "../../app/providers/VaultProvider";
import { useDbState } from "../../app/providers/DbProvider";
import { BlueprintGeneratorImpl } from "../../ai/features/blueprint/generator";
import { materializeBlueprint, type MaterializeCourseResult } from "../../ai/features/blueprint/materializer";
import { validatePartialBlueprint } from "../../ai/features/blueprint/validator";
import type {
  CourseBlueprint,
  BlueprintTarget,
  GenerationMode,
} from "../../ai/features/blueprint/types";

export type BlueprintPhase =
  | "idle"
  | "setting-target"
  | "generating"
  | "reviewing"
  | "materializing"
  | "done"
  | "error";

export interface BlueprintState {
  phase: BlueprintPhase;
  mode: GenerationMode | null;
  target: BlueprintTarget | null;
  blueprint: CourseBlueprint | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  isStreaming: boolean;
  materializeResult: MaterializeCourseResult | null;
  error: string | null;
}

export interface UseBlueprintReturn extends BlueprintState {
  /** Start the target-setting phase. */
  startNew(): void;

  /**
   * Begin Mode A (conversational sparring) with the given target.
   * The AI starts the calibration dialogue.
   */
  startModeA(target: BlueprintTarget): void;

  /**
   * Begin Mode B (RAG synthesis) with the given target.
   * Retrieves context from ingested resources and synthesizes a blueprint.
   */
  startModeB(target: BlueprintTarget): void;

  /** Mode A: Send a message during conversational generation. */
  sendMessage(text: string): Promise<void>;

  /**
   * Extract the blueprint from the conversation (Mode A finalize).
   * Transitions to "reviewing" on success.
   */
  finalizeBlueprint(): void;

  /**
   * Update the blueprint in review (user edits).
   */
  updateBlueprint(update: Partial<CourseBlueprint>): void;

  /** Materialize the blueprint (user approved). */
  materialize(): Promise<void>;

  /** Reset to idle. */
  reset(): void;

  /** Dismiss error and go back to idle. */
  dismissError(): void;
}

export function useBlueprint(): UseBlueprintReturn {
  const router = useAIRouter();
  const rag = useRAG();
  const vaultId = useActiveVaultId();
  const vaultState = useVaultState();
  const dbState = useDbState();
  const db = dbState.status === "ready" ? dbState.db : null;
  const vault = vaultState.status === "ready" ? vaultState.vault : null;

  const [phase, setPhase] = useState<BlueprintPhase>("idle");
  const [mode, setMode] = useState<GenerationMode | null>(null);
  const [target, setTarget] = useState<BlueprintTarget | null>(null);
  const [blueprint, setBlueprint] = useState<CourseBlueprint | null>(null);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [materializeResult, setMaterializeResult] = useState<MaterializeCourseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable generator instance
  const generator = useMemo(
    () => new BlueprintGeneratorImpl({ router }),
    [router],
  );



  const startNew = useCallback(() => {
    setPhase("setting-target");
    setMode(null);
    setTarget(null);
    setBlueprint(null);
    setMessages([]);
    setIsStreaming(false);
    setMaterializeResult(null);
    setError(null);
  }, []);

  const startModeA = useCallback(
    (t: BlueprintTarget) => {
      if (!vaultId || !db || !vault) {
        setError("Vault and database must be ready.");
        return;
      }
      setMode("a");
      setTarget(t);
      setPhase("generating");
      setBlueprint(null);
      setMessages([]);
      setError(null);

      generator.startConversation(t);
    },
    [vaultId, db, vault, generator],
  );

  const startModeB = useCallback(
    async (t: BlueprintTarget) => {
      if (!vaultId || !db || !vault) {
        setError("Vault and database must be ready.");
        return;
      }
      setMode("b");
      setTarget(t);
      setPhase("generating");
      setBlueprint(null);
      setMessages([]);
      setError(null);

      // Retrieve RAG context from selected resources
      setIsStreaming(true);
      try {
        const k = t.resourceIds?.length ? t.resourceIds.length * 5 : 10;
        const results = await rag.search(t.topic, k);

        const contextChunks = results.map(
          (r) =>
            `[source: ${r.chunk.source_title}]${r.chunk.heading_path ? ` (${r.chunk.heading_path})` : ""} ${
              r.chunk.text_content
            }`,
        );

        // If no context found, still try with empty context
        const blueprint = await generator.synthesize(t, contextChunks);
        setBlueprint(blueprint);
        setMessages(generator.getMessages());
        setPhase("reviewing");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Blueprint synthesis failed");
      } finally {
        setIsStreaming(false);
      }
    },
    [vaultId, db, vault, rag, generator],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      setIsStreaming(true);
      try {
        const iter = generator.sendMessage(text);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of iter) {
          setMessages(generator.getMessages());
        }
        setMessages(generator.getMessages());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send message");
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, generator],
  );

  const finalizeBlueprint = useCallback(() => {
    const bp = generator.extractBlueprint();
    if (bp) {
      setBlueprint(bp);
      setPhase("reviewing");
    } else {
      setError(
        "Could not extract a blueprint from the conversation. The AI may not have emitted one yet — try asking it to finalize the design.",
      );
    }
  }, [generator]);

  const updateBlueprint = useCallback((update: Partial<CourseBlueprint>) => {
    setBlueprint((prev) => {
      if (!prev) return prev;
      const validated = validatePartialBlueprint(update);
      return { ...prev, ...validated };
    });
  }, []);

  const materialize = useCallback(async () => {
    if (!blueprint || !vaultId || !db || !vault) {
      setError("Cannot materialize: missing blueprint, vault, or database.");
      return;
    }
    setPhase("materializing");
    setError(null);
    try {
      const result = await materializeBlueprint({ db, vault, vaultId }, blueprint);
      setMaterializeResult(result);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Materialization failed");
      setPhase("error");
    }
  }, [blueprint, vaultId, db, vault]);

  const reset = useCallback(() => {
    setPhase("idle");
    setMode(null);
    setTarget(null);
    setBlueprint(null);
    setMessages([]);
    setIsStreaming(false);
    setMaterializeResult(null);
    setError(null);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
    setPhase("idle");
  }, []);

  return {
    phase,
    mode,
    target,
    blueprint,
    messages,
    isStreaming,
    materializeResult,
    error,
    startNew,
    startModeA,
    startModeB,
    sendMessage,
    finalizeBlueprint,
    updateBlueprint,
    materialize,
    reset,
    dismissError,
  };
}
