import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useDbState } from "./DbProvider";
import { getSetting, setSetting } from "../../db";
import type { Vault } from "../../vault";
import { VAULT_PATH_KEY } from "./vault/keys";
import { defaultPicker, type FolderPicker } from "./vault/picker";
import { createConnector, type VaultConnector } from "./vault/connect";

/**
 * The active-vault composition root (Constitution IV / FR-010), mirroring `DbProvider`. Holds
 * the single source of "which vault is active" as a discriminated state, plus the actions that
 * mutate it. Deep Tauri pieces (the folder chooser, the fs-scope grant + `createVault`) sit
 * behind the `picker`/`connect` seams so every flow is unit-testable without the runtime.
 *
 * Mounts ABOVE the AppShell store-gate, so it reads `useDbState()` (not `useDb()`) and stays
 * `checking` until the store is ready — calling `useDb()` here would throw before then.
 */
export type VaultState =
  | { status: "checking" }
  | { status: "unset" }
  | { status: "ready"; path: string; vault: Vault; noteCount: number; id: string }
  | { status: "unavailable"; path: string; error: Error };

export interface VaultActions {
  /** Open the picker; on a chosen folder connect it; on success persist + go ready; on cancel
   *  do nothing; on connect failure surface the error WITHOUT clobbering the current config. */
  chooseVault(): Promise<void>;
  /** The "change" affordance — identical flow to chooseVault (current vault stays until success). */
  changeVault(): Promise<void>;
  /** Re-attempt connecting the currently-stored path (from `unavailable`). */
  retry(): Promise<void>;
}

interface VaultContextValue {
  state: VaultState;
  actions: VaultActions;
  /** Transient error from the last action (e.g. a chosen folder that wouldn't connect). */
  actionError: Error | null;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export interface VaultProviderProps {
  children: ReactNode;
  /** Test seam: how to choose a folder. Defaults to the native dialog. */
  picker?: FolderPicker;
  /** Test seam: how to authorize + build + probe a vault. Defaults to the production connector. */
  connect?: VaultConnector;
}

export function VaultProvider({ children, picker = defaultPicker, connect: connectProp }: VaultProviderProps) {
  const dbState = useDbState();
  const db = dbState.status === "ready" ? dbState.db : null;
  const [state, setState] = useState<VaultState>({ status: "checking" });
  const [actionError, setActionError] = useState<Error | null>(null);

  // The connector: injected (tests) or built from the ready store (production).
  const connect = useMemo<VaultConnector | null>(
    () => connectProp ?? (db ? createConnector(db) : null),
    [connectProp, db],
  );

  // Boot/read: once the store is ready, load the stored path and resolve the initial state.
  useEffect(() => {
    if (!db || !connect) return; // still `checking` until the store is ready
    let cancelled = false;
    setState({ status: "checking" });
    (async () => {
      const path = await getSetting(db, VAULT_PATH_KEY);
      if (cancelled) return;
      if (!path) {
        setState({ status: "unset" });
        return;
      }
      const result = await connect(path);
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", path, vault: result.vault, noteCount: result.noteCount, id: result.id }
          : { status: "unavailable", path, error: result.error },
      );
    })().catch((err) => {
      if (!cancelled) setState({ status: "unavailable", path: "", error: toError(err) });
    });
    return () => {
      cancelled = true;
    };
  }, [db, connect]);

  // Choose (and change — same flow): pick → connect → persist-on-success; keep prior state on fail.
  const choose = useCallback(async () => {
    if (!db || !connect) return;
    const picked = await picker();
    if (picked == null) return; // cancel → unchanged (FR-008)
    setActionError(null);
    const result = await connect(picked);
    if (result.ok) {
      await setSetting(db, VAULT_PATH_KEY, picked); // persist only on success (R5)
      setState({ status: "ready", path: picked, vault: result.vault, noteCount: result.noteCount, id: result.id });
    } else {
      setActionError(result.error); // surfaced; current state untouched
    }
  }, [db, connect, picker]);

  const retry = useCallback(async () => {
    if (!db || !connect) return;
    const path = state.status === "unavailable" ? state.path : await getSetting(db, VAULT_PATH_KEY);
    if (!path) {
      setState({ status: "unset" });
      return;
    }
    setActionError(null);
    setState({ status: "checking" });
    const result = await connect(path);
    setState(
      result.ok
        ? { status: "ready", path, vault: result.vault, noteCount: result.noteCount, id: result.id }
        : { status: "unavailable", path, error: result.error },
    );
  }, [db, connect, state]);

  const value = useMemo<VaultContextValue>(
    () => ({ state, actionError, actions: { chooseVault: choose, changeVault: choose, retry } }),
    [state, actionError, choose, retry],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

function useVaultContext(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (ctx === null) throw new Error("useVault* must be used within a <VaultProvider>");
  return ctx;
}

/** The raw vault state — for the Vault screen and the first-run banner. */
export function useVaultState(): VaultState {
  return useVaultContext().state;
}

/** The active vault's stable id (Feature 009), or `null` unless a vault is ready. The reactivity
 *  + scoping key: screen hooks key their loads on it so a vault switch re-scopes every view, and
 *  pass it to the per-vault repositories. */
export function useActiveVaultId(): string | null {
  const { state } = useVaultContext();
  return state.status === "ready" ? state.id : null;
}

/** The active vault handle. MUST be called only when ready (knowledge features gate on it);
 *  throws otherwise so callers never null-check. */
export function useVault(): Vault {
  const { state } = useVaultContext();
  if (state.status !== "ready") throw new Error("useVault() called before a vault is ready");
  return state.vault;
}

export function useVaultActions(): VaultActions {
  return useVaultContext().actions;
}

/** The transient error from the last action (e.g. a chosen folder that wouldn't connect). */
export function useVaultError(): Error | null {
  return useVaultContext().actionError;
}
