/**
 * useResearch hook — wraps ResearchEngineImpl + search provider in
 * React state management. Features consume this hook — never import the
 * engine directly (Constitution IV).
 *
 * Manages the full research lifecycle:
 *   idle → goal-setting → researching → reviewing → materializing → done
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useAIRouter } from "../../../../app/providers/AIProvider";
import { useActiveVaultId } from "../../../../app/providers/VaultProvider";
import { useDbState } from "../../../../app/providers/DbProvider";
import { getSetting } from "../../../../db";
import { ResearchEngineImpl } from "../engine";
import { createSearchProvider } from "../searcher";
import { materializeBlueprint } from "../../blueprint/materializer";
import { useVault } from "../../../../app/providers/VaultProvider";
import type {
  ResearchGoal,
  ResearchPhase,
  ResearchResult,
  WebSearchProvider,
} from "../types";
import type { MaterializeCourseResult } from "../../blueprint/materializer";

export type ResearchUIState =
  | "idle"
  | "setting-goal"
  | "researching"
  | "reviewing"
  | "materializing"
  | "done"
  | "error";

export interface UseResearchReturn {
  /** Current UI state. */
  uiState: ResearchUIState;
  /** Current research phase (pipeline progress). */
  phase: ResearchPhase;
  /** Human-readable progress message. */
  message: string;
  /** Progress value within current phase (0-1). */
  progress: number;
  /** Result after research completes. */
  result: ResearchResult | null;
  /** Materialization results per course. */
  materializeResults: MaterializeCourseResult[];
  /** Error message. */
  error: string | null;
  /** Research settings. */
  searchUrl: string;

  /** Start the research pipeline with a goal. */
  startResearch(goal: ResearchGoal): Promise<void>;
  /** Materialize all courses in the result. */
  materializeAll(): Promise<void>;
  /** Dismiss error and reset. */
  dismissError(): void;
  /** Reset to idle. */
  reset(): void;
}

export function useResearch(): UseResearchReturn {
  const router = useAIRouter();
  const vaultId = useActiveVaultId();
  const vault = useVault();
  const dbState = useDbState();
  const db = dbState.status === "ready" ? dbState.db : null;

  const [uiState, setUiState] = useState<ResearchUIState>("idle");
  const [phase, setPhase] = useState<ResearchPhase>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [materializeResults, setMaterializeResults] = useState<MaterializeCourseResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchUrl, setSearchUrl] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Load search URL setting on mount
  useMemo(() => {
    if (!db) return;
    (async () => {
      const raw = await getSetting(db, "research.search_url");
      if (raw) setSearchUrl(raw);
    })();
  }, [db]);

  // Stable engine instance
  const searchProviderRef = useRef<WebSearchProvider | null>(null);

  const engine = useMemo(() => {
    if (!vaultId) return null;
    searchProviderRef.current = createSearchProvider(searchUrl);
    return new ResearchEngineImpl({ router, searchProvider: searchProviderRef.current, vaultId });
  }, [router, vaultId, searchUrl]);

  const startResearch = useCallback(
    async (goal: ResearchGoal) => {
      if (!engine || !vaultId || !db || !vault) {
        setError("Vault and database must be ready.");
        return;
      }

      setUiState("researching");
      setPhase("searching");
      setMessage("Starting research…");
      setProgress(0);
      setResult(null);
      setError(null);
      setMaterializeResults([]);

      abortRef.current = new AbortController();

      try {
        for await (const event of engine.execute(goal)) {
          // Check for abort
          if (abortRef.current?.signal.aborted) {
            setUiState("idle");
            return;
          }

          setPhase(event.phase);
          setMessage(event.message);
          setProgress(event.progress ?? 0);

          if (event.phase === "error") {
            setError(event.error ?? "Research failed");
            setUiState("error");
            return;
          }

          if (event.phase === "done") {
            const researchResult = engine.getResult();
            setResult(researchResult);
            setUiState("reviewing");
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Research failed");
        setUiState("error");
      }
    },
    [engine, vaultId, db, vault],
  );

  const materializeAll = useCallback(async () => {
    if (!result || !vaultId || !db || !vault) {
      setError("Cannot materialize: missing result, vault, or database.");
      return;
    }

    setUiState("materializing");
    setError(null);
    const results: MaterializeCourseResult[] = [];

    for (const course of result.courses) {
      try {
        const r = await materializeBlueprint(
          { db, vault, vaultId },
          course.courseBlueprint,
        );
        results.push(r);
      } catch (e) {
        setError(
          `Failed to materialize "${course.title}": ${e instanceof Error ? e.message : "Unknown error"}`,
        );
        setUiState("error");
        return;
      }
    }

    setMaterializeResults(results);
    setUiState("done");
  }, [result, vaultId, db, vault]);

  const dismissError = useCallback(() => {
    setError(null);
    setUiState("idle");
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setUiState("idle");
    setPhase("idle");
    setMessage("");
    setProgress(0);
    setResult(null);
    setMaterializeResults([]);
    setError(null);
  }, []);

  return {
    uiState,
    phase,
    message,
    progress,
    result,
    materializeResults,
    error,
    searchUrl,
    startResearch,
    materializeAll,
    dismissError,
    reset,
  };
}
