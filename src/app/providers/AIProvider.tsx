import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDbState } from "./DbProvider";
import {
  loadAIConfig,
  AIConfigError,
  emptyAIConfig,
  type AIConfig,
} from "../../ai/config";
import { createProvider } from "../../ai/adapters";
import { defaultRouter, type RouterEvent } from "../../ai/routerImpl";
import type { Provider } from "../../ai/provider";
import type { SecretStore } from "../../ai/secrets";
import type { AIRouter } from "../../ai/router";
import { TauriKeychainSecretStore } from "../../ai/adapters/secrets/tauri";
import { tauriFetch } from "../../ai/adapters/tauriFetch";

/**
 * AIProvider composition root (Feature 016 / Constitution IV — Pocock interface-first / deep
 * modules). Owns the lifecycle of the `AIRouter` and the per-provider adapter map. Mirrors
 * `DbProvider` / `VaultProvider`. Features consume the router via `useAIRouter()` exclusively —
 * adapter classes are never imported outside `src/ai/adapters/**` (Constitution II; tested by
 * `src/ai/boundary.test.ts` in T073a).
 *
 * DI seams: `createProviderFn` + `secretStore` props are injected in tests to keep them off the
 * network and off the OS keychain. Production wires the real ones.
 */

export type AIState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | {
      status: "ready";
      router: AIRouter;
      config: AIConfig;
      secrets: SecretStore;
      /** Non-null iff the on-disk config failed to load (corrupt JSON or zod-invalid). The
       *  router still runs against an `emptyAIConfig()` so the Settings UI keeps working;
       *  the UI (T028a) renders a "Reset?" callout when this is set. */
      loadError: AIConfigError | null;
      /** Subscribe to router events (`ai:auth-failed`, `ai:lockdown-blocked`). */
      on: (event: RouterEvent, handler: (payload: { providerId: string }) => void) => () => void;
      /** Re-build the router from a freshly-loaded config. Called by the settings UI after save. */
      reload: () => void;
    };

const AIContext = createContext<AIState | null>(null);

export interface AIProviderProps {
  children: ReactNode;
  createProviderFn?: typeof createProvider;
  secretStore?: SecretStore;
  /** The `fetch` adapters use for provider HTTP. Production injects `tauriFetch` (native, CORS-free,
   *  streaming); tests inject `createProviderFn` fakes and never exercise this. */
  fetchFn?: typeof fetch;
}

interface Listeners {
  authFailed: Set<(payload: { providerId: string }) => void>;
  lockdownBlocked: Set<(payload: { providerId: string }) => void>;
}

function emptyListeners(): Listeners {
  return { authFailed: new Set(), lockdownBlocked: new Set() };
}

export function AIProvider({
  children,
  createProviderFn = createProvider,
  secretStore,
  fetchFn = tauriFetch,
}: AIProviderProps) {
  const dbState = useDbState();
  const listenersRef = useRef<Listeners>(emptyListeners());
  const secretsRef = useRef<SecretStore>(secretStore ?? new TauriKeychainSecretStore());
  const fetchRef = useRef<typeof fetch>(fetchFn);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Initial state: render eagerly as "ready" with an empty config (so the route tree mounts
  // immediately and isn't blocked by an async load). The async load below replaces this with the
  // real config once it returns. If `dbState` isn't ready yet, we stay on the empty-ready state —
  // there's no DB to load from yet, and switching to "loading" would unmount any AI-consuming
  // child unnecessarily.
  const [state, setState] = useState<AIState>(() =>
    makeReadyState(emptyAIConfig(), secretsRef.current, createProviderFn, fetchRef.current, listenersRef, null, reload),
  );

  useEffect(() => {
    if (dbState.status !== "ready") return;
    const db = dbState.db;
    const secrets = secretsRef.current;
    let cancelled = false;

    (async () => {
      let config: AIConfig;
      let loadError: AIConfigError | null = null;
      try {
        config = await loadAIConfig(db);
      } catch (e) {
        if (e instanceof AIConfigError) {
          // Recoverable: run against an empty config + surface the error in state.
          config = emptyAIConfig();
          loadError = e;
        } else {
          if (!cancelled) setState({ status: "error", error: e instanceof Error ? e : new Error(String(e)) });
          return;
        }
      }
      if (cancelled) return;
      setState(makeReadyState(config, secrets, createProviderFn, fetchRef.current, listenersRef, loadError, reload));
    })();

    return () => {
      cancelled = true;
    };
  }, [dbState, reloadKey, createProviderFn, reload]);

  return <AIContext.Provider value={state}>{children}</AIContext.Provider>;
}

function makeReadyState(
  config: AIConfig,
  secrets: SecretStore,
  createProviderFn: typeof createProvider,
  fetchFn: typeof fetch,
  listenersRef: { current: Listeners },
  loadError: AIConfigError | null,
  reload: () => void,
): AIState {
  const providers = new Map<string, Provider>();
  for (const pcfg of config.providers) {
    try {
      providers.set(pcfg.id, createProviderFn(pcfg, secrets, fetchFn));
    } catch {
      // Skip providers that fail to instantiate; the router surfaces `unsupported` if a role
      // references them.
    }
  }

  const router = defaultRouter({
    config,
    providers,
    emit: (event, payload) => {
      const set = event === "ai:auth-failed" ? listenersRef.current.authFailed : listenersRef.current.lockdownBlocked;
      for (const fn of set) fn(payload);
    },
  });

  return {
    status: "ready",
    router,
    config,
    secrets,
    loadError,
    on(event, handler) {
      const set = event === "ai:auth-failed" ? listenersRef.current.authFailed : listenersRef.current.lockdownBlocked;
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
    reload,
  };
}

export function useAIState(): AIState {
  const ctx = useContext(AIContext);
  if (ctx === null) throw new Error("useAIState must be used within an <AIProvider>");
  return ctx;
}

export function useAIRouter(): AIRouter {
  const state = useAIState();
  if (state.status !== "ready") {
    throw new Error("useAIRouter() called before the AI layer is ready");
  }
  return state.router;
}

export function useReadyAI(): Extract<AIState, { status: "ready" }> {
  const s = useAIState();
  if (s.status !== "ready") throw new Error("useReadyAI() called before AI ready");
  return s;
}
