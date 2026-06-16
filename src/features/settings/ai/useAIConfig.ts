import { useCallback, useEffect, useState } from "react";
import { useDb } from "../../../app/providers/DbProvider";
import { useAIState } from "../../../app/providers/AIProvider";
import {
  saveAIConfig,
  emptyAIConfig,
  type AIConfig,
  type AIRole,
  type ProviderConfig,
  type ProviderType,
  type RoleTarget,
  type AIConfigError,
} from "../../../ai/config";
import type { ProbeOutcome } from "../../../ai/provider";
import { ProviderError, isProviderError } from "../../../ai/errors";

/**
 * AI settings state hook (Feature 016, contracts/ui-settings.md). Wraps load/save/probe + secret
 * orchestration behind a single hook the AI section consumes. Reads the live AI state from
 * `AIProvider` (which owns the router + config + secrets) and persists through `saveAIConfig`
 * + the injected `SecretStore`.
 *
 * The hook DOES NOT instantiate adapters or talk to the keychain directly — those are owned by
 * the composition root. It only sequences the high-level operations the UI needs.
 */

export interface ProviderFormInput {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl?: string;
  /** Present iff the user pasted a key in the form (i.e., new add OR edit-with-replacement).
   *  Absent or empty → leave the existing keychain entry alone (edit mode preserves the secret). */
  apiKey?: string;
  defaultModel?: string;
  embedModel?: string;
}

export type ProbeResult = ProbeOutcome | { error: string };

export interface UseAIConfigResult {
  config: AIConfig;
  loadError: AIConfigError | null;
  probes: Record<string, ProbeResult | undefined>;
  reAuthRequired: ReadonlySet<string>;

  addProvider(input: ProviderFormInput): Promise<{ ok: boolean; error?: string }>;
  editProvider(id: string, input: ProviderFormInput): Promise<{ ok: boolean; error?: string }>;
  removeProvider(id: string): Promise<{ ok: boolean; error?: string; rolesUnassigned?: AIRole[] }>;
  testConnection(id: string): Promise<ProbeResult>;

  setRoleTarget(role: AIRole, target: RoleTarget | null): Promise<void>;
  addFallback(role: AIRole, providerId: string, model: string): Promise<void>;
  removeFallback(role: AIRole, index: number): Promise<void>;

  setLockdown(on: boolean): Promise<void>;

  /** Returns the AIConfigError reset path: replaces the corrupt config with an empty one. */
  resetToDefaults(): Promise<void>;
}

export function useAIConfig(): UseAIConfigResult {
  const db = useDb();
  const ai = useAIState();
  const [probes, setProbes] = useState<Record<string, ProbeResult | undefined>>({});
  const [reAuthRequired, setReAuthRequired] = useState<ReadonlySet<string>>(new Set());

  // Subscribe to the router's auth-failed events → flag the affected provider for re-auth.
  useEffect(() => {
    if (ai.status !== "ready") return;
    const off = ai.on("ai:auth-failed", ({ providerId }) => {
      setReAuthRequired((prev) => {
        const next = new Set(prev);
        next.add(providerId);
        return next;
      });
    });
    return off;
  }, [ai]);

  const liveConfig = ai.status === "ready" ? ai.config : emptyAIConfig();
  const loadError = ai.status === "ready" ? ai.loadError : null;

  const persist = useCallback(
    async (next: AIConfig) => {
      const saved = await saveAIConfig(db, next);
      if (ai.status === "ready") ai.reload();
      return saved;
    },
    [db, ai],
  );

  const addProvider = useCallback(
    async (input: ProviderFormInput): Promise<{ ok: boolean; error?: string }> => {
      if (!input.id.trim()) return { ok: false, error: "An id is required." };
      if (liveConfig.providers.some((p) => p.id === input.id)) {
        return { ok: false, error: `A provider with id "${input.id}" already exists.` };
      }
      try {
        // Only Anthropic requires a key up front. openai-compatible accepts keyless local servers
        // (LM Studio, llama.cpp `--server`, vLLM) AND keyed remote vendors (OpenAI, OpenRouter,
        // etc.) — the user picks per provider.
        if (input.type === "anthropic" && !input.apiKey?.trim()) {
          return { ok: false, error: "An API key is required for Anthropic." };
        }
        if (ai.status === "ready" && input.apiKey?.trim()) {
          await ai.secrets.set(input.id, input.apiKey.trim());
        }
        const pcfg: ProviderConfig = buildProviderConfig(input);
        const next: AIConfig = { ...liveConfig, providers: [...liveConfig.providers, pcfg] };
        await persist(next);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: msgOf(e) };
      }
    },
    [ai, liveConfig, persist],
  );

  const editProvider = useCallback(
    async (id: string, input: ProviderFormInput): Promise<{ ok: boolean; error?: string }> => {
      const existing = liveConfig.providers.find((p) => p.id === id);
      if (!existing) return { ok: false, error: "Provider not found." };
      try {
        if (ai.status === "ready" && input.apiKey?.trim()) {
          await ai.secrets.set(id, input.apiKey.trim());
        }
        let pcfg: ProviderConfig = buildProviderConfig({ ...input, id });
        // Preserve an existing keychain link across "leave blank to keep" edits — buildProviderConfig
        // only sets apiKeyRef when input.apiKey is provided, so without this we'd orphan the key.
        if (
          pcfg.type === "openai-compatible" &&
          existing.apiKeyRef &&
          !input.apiKey?.trim()
        ) {
          pcfg = { ...pcfg, apiKeyRef: existing.apiKeyRef } as ProviderConfig;
        }
        const providers = liveConfig.providers.map((p) => (p.id === id ? pcfg : p));
        const next: AIConfig = { ...liveConfig, providers };
        await persist(next);
        // Clear any re-auth flag once the key has been replaced.
        if (input.apiKey?.trim()) {
          setReAuthRequired((prev) => {
            const n = new Set(prev);
            n.delete(id);
            return n;
          });
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: msgOf(e) };
      }
    },
    [ai, liveConfig, persist],
  );

  const removeProvider = useCallback(
    async (id: string) => {
      try {
        // Clear roles that reference the provider (transitively through fallback chains).
        const cleared: AIRole[] = [];
        const routing = { ...liveConfig.routing };
        for (const role of ["reasoning", "drafting", "embeddings"] as AIRole[]) {
          const updated = pruneProviderFromChain(routing[role], id);
          if (routing[role] !== updated) {
            routing[role] = updated;
            if (routing[role] === null) cleared.push(role);
          }
        }
        // Delete the secret first (idempotent — Ollama providers have nothing in the keychain).
        if (ai.status === "ready") await ai.secrets.delete(id);
        const providers = liveConfig.providers.filter((p) => p.id !== id);
        const next: AIConfig = { ...liveConfig, providers, routing };
        await persist(next);
        setProbes((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
        setReAuthRequired((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
        return { ok: true, rolesUnassigned: cleared };
      } catch (e) {
        return { ok: false, error: msgOf(e) };
      }
    },
    [ai, liveConfig, persist],
  );

  const testConnection = useCallback(
    async (id: string): Promise<ProbeResult> => {
      if (ai.status !== "ready") return { error: "AI layer not ready" };
      try {
        const caps = await ai.router.probe(id, { force: true });
        setProbes((p) => ({ ...p, [id]: caps }));
        return caps;
      } catch (e) {
        const result: ProbeResult = { error: msgOf(e) };
        setProbes((p) => ({ ...p, [id]: result }));
        return result;
      }
    },
    [ai],
  );

  const setRoleTarget = useCallback(
    async (role: AIRole, target: RoleTarget | null) => {
      const next: AIConfig = { ...liveConfig, routing: { ...liveConfig.routing, [role]: target } };
      await persist(next);
    },
    [liveConfig, persist],
  );

  const addFallback = useCallback(
    async (role: AIRole, providerId: string, model: string) => {
      const target = liveConfig.routing[role];
      if (target === null) return;
      const next: AIConfig = {
        ...liveConfig,
        routing: { ...liveConfig.routing, [role]: appendFallback(target, { providerId, model }) },
      };
      await persist(next);
    },
    [liveConfig, persist],
  );

  const removeFallback = useCallback(
    async (role: AIRole, index: number) => {
      const target = liveConfig.routing[role];
      if (target === null) return;
      // index 0 means "remove the primary" — not supported here (use setRoleTarget(role, null) for that).
      if (index < 1) return;
      const next: AIConfig = {
        ...liveConfig,
        routing: { ...liveConfig.routing, [role]: removeFallbackAt(target, index) },
      };
      await persist(next);
    },
    [liveConfig, persist],
  );

  const setLockdown = useCallback(
    async (on: boolean) => {
      const next: AIConfig = { ...liveConfig, lockdown: on };
      await persist(next);
    },
    [liveConfig, persist],
  );

  const resetToDefaults = useCallback(async () => {
    await persist(emptyAIConfig());
  }, [persist]);

  return {
    config: liveConfig,
    loadError,
    probes,
    reAuthRequired,
    addProvider,
    editProvider,
    removeProvider,
    testConnection,
    setRoleTarget,
    addFallback,
    removeFallback,
    setLockdown,
    resetToDefaults,
  };
}

// ────────────────── helpers ──────────────────

function buildProviderConfig(input: ProviderFormInput): ProviderConfig {
  const base = {
    id: input.id.trim(),
    type: input.type,
    label: input.label.trim() || input.id.trim(),
    defaultModel: input.defaultModel?.trim() || undefined,
    embedModel: input.embedModel?.trim() || undefined,
  };
  switch (input.type) {
    case "ollama":
      return { ...base, baseUrl: (input.baseUrl ?? "http://localhost:11434").trim() } as ProviderConfig;
    case "openai-compatible":
      // apiKeyRef is set only when the user provided a key (now OR previously). The form's edit
      // mode passes `apiKey: undefined` when the field is blank ("keep existing"), so the caller
      // (editProvider) is responsible for preserving the prior apiKeyRef across edits.
      return {
        ...base,
        baseUrl: (input.baseUrl ?? "").trim(),
        ...(input.apiKey?.trim() ? { apiKeyRef: base.id } : {}),
      } as ProviderConfig;
    case "anthropic":
      return { ...base, apiKeyRef: base.id } as ProviderConfig;
    case "deepseek":
      return { ...base, apiKeyRef: base.id } as ProviderConfig;
    case "gemini":
      return { ...base, apiKeyRef: base.id } as ProviderConfig;
  }
}

function pruneProviderFromChain(target: RoleTarget | null, providerId: string): RoleTarget | null {
  if (target === null) return null;
  // Walk the chain copying out steps that don't reference providerId.
  const kept: Array<{ providerId: string; model: string }> = [];
  let cur: RoleTarget | undefined = target;
  while (cur) {
    if (cur.providerId !== providerId) kept.push({ providerId: cur.providerId, model: cur.model });
    cur = cur.fallback;
  }
  if (kept.length === 0) return null;
  // Rebuild linked list.
  let acc: RoleTarget | undefined;
  for (let i = kept.length - 1; i >= 0; i--) {
    acc = { ...kept[i], fallback: acc };
  }
  return acc ?? null;
}

function appendFallback(target: RoleTarget, step: { providerId: string; model: string }): RoleTarget {
  // Walk to the tail; append.
  if (target.fallback === undefined) return { ...target, fallback: step };
  return { ...target, fallback: appendFallback(target.fallback, step) };
}

function removeFallbackAt(target: RoleTarget, index: number): RoleTarget | null {
  if (index === 0) return null; // shouldn't happen — caller short-circuits
  if (index === 1) {
    // Remove the immediate fallback, splicing in whatever was after it.
    if (target.fallback === undefined) return target;
    const remaining = target.fallback.fallback;
    return { ...target, fallback: remaining };
  }
  if (target.fallback === undefined) return target;
  const next = removeFallbackAt(target.fallback, index - 1);
  return { ...target, fallback: next === null ? undefined : next };
}

function msgOf(e: unknown): string {
  if (isProviderError(e)) return `${e.kind}: ${e.message}`;
  if (e instanceof ProviderError) return `${e.kind}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}
