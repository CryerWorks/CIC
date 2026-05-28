import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { initDatabase, type SqlExecutor } from "../../db";

/**
 * The UI-layer composition root (Constitution IV). Owns the SQLite store lifecycle and exposes
 * it to the React tree as a discriminated union; screens get a live `SqlExecutor` via `useDb()`
 * or they don't render (AppShell gates on the state). Errors are surfaced, never swallowed.
 */
export type DbState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ready"; db: SqlExecutor };

const DbContext = createContext<DbState | null>(null);

export interface DbProviderProps {
  children: ReactNode;
  /** Test seam: how to obtain a (migrated) executor. Defaults to the 003 initDatabase. */
  initialize?: () => Promise<SqlExecutor>;
}

export function DbProvider({ children, initialize = initDatabase }: DbProviderProps) {
  const [state, setState] = useState<DbState>({ status: "loading" });
  // Hold the initializer in a ref so the effect runs once on mount without re-init loops if a
  // parent passes an inline function.
  const initRef = useRef(initialize);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    initRef
      .current()
      .then((db) => {
        if (!cancelled) setState({ status: "ready", db });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", error: err instanceof Error ? err : new Error(String(err)) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <DbContext.Provider value={state}>{children}</DbContext.Provider>;
}

/** The raw store state — for the gate component (AppShell) that renders loading/error/ready. */
export function useDbState(): DbState {
  const ctx = useContext(DbContext);
  if (ctx === null) throw new Error("useDbState must be used within a <DbProvider>");
  return ctx;
}

/** The live executor. MUST be called only from a screen rendered under the ready gate;
 *  throws otherwise so callers never have to null-check. */
export function useDb(): SqlExecutor {
  const state = useDbState();
  if (state.status !== "ready") {
    throw new Error("useDb() called before the database is ready");
  }
  return state.db;
}
