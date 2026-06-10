/**
 * Default AIRouter implementation (Feature 016 / Constitution II). The single AI chokepoint:
 *   1. Resolves role → RoleTarget.
 *   2. Walks the chain. At EVERY step:
 *        a. Runs the lockdown gate (per-step, per L1/C1).
 *        b. Applies the embed capability re-route (after the gate accepts).
 *        c. Dispatches.
 *   3. On retryable error → next fallback. On non-retryable → surface.
 *   4. On `auth` → emits `'ai:auth-failed'` event AND surfaces.
 *
 * Deep module. Full contract:
 * [specs/016-ai-provider-layer/contracts/router.md](../../specs/016-ai-provider-layer/contracts/router.md).
 */

import type { AIConfig, AIRole, RoleTarget } from "./config";
import type {
  Provider,
  ChatMessage,
  ChatOptions,
  ChatChunk,
  EmbedOptions,
  EmbedResult,
  ProbeOutcome,
} from "./provider";
import { ProviderError, isProviderError, isAuthFailure, isCancellation } from "./errors";
import type { AIRouter } from "./router";

export type RouterEvent = "ai:auth-failed" | "ai:lockdown-blocked";

export interface DefaultRouterDeps {
  config: AIConfig;
  /** providerId → instantiated Provider. Built by the composition root from `config.providers[]`. */
  providers: Map<string, Provider>;
  /** Optional event sink. The settings UI listens to surface re-auth affordances. */
  emit?: (event: RouterEvent, payload: { providerId: string }) => void;
}

interface ProbeCacheKey {
  providerId: string;
  baseUrlSignature: string;
  configVersion: number;
}

function probeCacheKeyToString(k: ProbeCacheKey): string {
  return `${k.providerId}|${k.baseUrlSignature}|${k.configVersion}`;
}

export function defaultRouter(deps: DefaultRouterDeps): AIRouter {
  const { config, providers, emit } = deps;
  const probeCache = new Map<string, ProbeOutcome>();

  function ensureRoleTarget(role: AIRole): RoleTarget {
    const t = config.routing[role];
    if (t === null) {
      throw new ProviderError("unsupported", "", `role ${role} is unassigned`, false);
    }
    return t;
  }

  function lockdownBlocks(provider: Provider, containsVaultContent: boolean): boolean {
    if (!containsVaultContent) return false;
    if (!config.lockdown) return false;
    return !provider.capabilities().isLocal;
  }

  /**
   * Walk the fallback chain looking for the first step that the lockdown gate ACCEPTS. Returns the
   * accepted step, OR (if every step is blocked or refers to a missing provider) the lockdown
   * error from the last blocked step.
   *
   * This implements the per-step gating contract (L1 / C1): we step past blocked-by-lockdown
   * targets the way we'd step past a missing-provider target, so a `[remote→local]` chain with
   * lockdown ON + vault content lands on the local step. The DISPATCH-driven retryable walk
   * (below) repeats this same routine at each retry point.
   */
  function findAcceptedStep(
    target: RoleTarget,
    containsVaultContent: boolean,
  ): { provider: Provider; target: RoleTarget } {
    let cur: RoleTarget | undefined = target;
    let lastBlockedId: string | null = null;
    while (cur) {
      const p = providers.get(cur.providerId);
      if (!p) {
        // Missing provider: skip to the next.
        if (cur.fallback) {
          cur = cur.fallback;
          continue;
        }
        throw new ProviderError(
          "unsupported",
          cur.providerId,
          `provider ${cur.providerId} is not loaded`,
          false,
        );
      }
      if (lockdownBlocks(p, containsVaultContent)) {
        // Gate trips on this step; skip to fallback if any.
        lastBlockedId = cur.providerId;
        emit?.("ai:lockdown-blocked", { providerId: cur.providerId });
        if (cur.fallback) {
          cur = cur.fallback;
          continue;
        }
        // No further fallback — surface the lockdown error.
        throw new ProviderError(
          "unsupported",
          cur.providerId,
          "local-only lockdown blocks remote providers for vault content",
          false,
        );
      }
      return { provider: p, target: cur };
    }
    // If somehow we exit the loop without returning or throwing, treat as blocked.
    throw new ProviderError(
      "unsupported",
      lastBlockedId ?? "",
      "no provider in the chain passed the lockdown gate",
      false,
    );
  }

  /** For the embed capability re-route: returns the FIRST local + embeddings-capable provider in
   *  the embeddings-role chain, or `null` if none. The re-route is privacy-preserving by
   *  construction — only local targets are selected. */
  function findLocalEmbeddings(): Provider | null {
    let cur: RoleTarget | null = config.routing.embeddings;
    while (cur) {
      const p = providers.get(cur.providerId);
      if (p && p.capabilities().isLocal && p.capabilities().embeddings) return p;
      cur = cur.fallback ?? null;
    }
    return null;
  }

  return {
    chat(role, messages, opts) {
      return dispatchChat(role, messages, opts);
    },

    async embed(role, texts, opts) {
      return dispatchEmbed(role, texts, opts);
    },

    async probe(providerId, probeOpts) {
      const provider = providers.get(providerId);
      if (!provider) {
        throw new ProviderError(
          "unsupported",
          providerId,
          `provider ${providerId} is not configured`,
          false,
        );
      }
      const cfg = config.providers.find((p) => p.id === providerId);
      const baseUrlSignature = cfg?.baseUrl ?? "";
      const key = probeCacheKeyToString({
        providerId,
        baseUrlSignature,
        configVersion: config.version,
      });
      if (!probeOpts?.force) {
        const cached = probeCache.get(key);
        if (cached) return cached;
      }
      // Live reachability probe. The adapter makes one cheap HTTP call (Ollama: GET /api/tags;
      // OpenAI-compatible: GET /v1/models; Anthropic: 1-token POST /v1/messages) and either
      // returns capabilities + measured latency, or throws ProviderError. Cache the success.
      const fresh = await provider.probe({ signal: probeOpts?.signal });
      probeCache.set(key, fresh);
      return fresh;
    },
  };

  async function* dispatchChat(
    role: AIRole,
    messages: ChatMessage[],
    opts: ChatOptions,
  ): AsyncIterable<ChatChunk> {
    let target = ensureRoleTarget(role);
    while (true) {
      // Per-step gate: find the first step in the remaining chain that the gate accepts.
      const accepted = findAcceptedStep(target, opts.containsVaultContent);
      try {
        yield* accepted.provider.chat(messages, opts);
        return;
      } catch (err) {
        if (!isProviderError(err)) throw err;
        if (isAuthFailure(err)) {
          emit?.("ai:auth-failed", { providerId: accepted.target.providerId });
          throw err;
        }
        if (isCancellation(err)) throw err;
        if (!err.retryable) throw err;
        if (!accepted.target.fallback) throw err;
        // Walk to the next step; the loop re-runs the gate on the new chain head.
        target = accepted.target.fallback;
      }
    }
  }

  async function dispatchEmbed(
    role: AIRole,
    texts: string[],
    opts: EmbedOptions,
  ): Promise<EmbedResult> {
    let target = ensureRoleTarget(role);
    while (true) {
      const accepted = findAcceptedStep(target, opts.containsVaultContent);

      // Embed capability re-route: runs AFTER the gate accepts. The re-route ONLY targets local
      // providers (`findLocalEmbeddings`), so the gate decision at the current step is preserved.
      let effective: Provider = accepted.provider;
      if (!effective.capabilities().embeddings) {
        const fallbackLocal = findLocalEmbeddings();
        if (fallbackLocal) effective = fallbackLocal;
      }

      try {
        return await effective.embed(texts, opts);
      } catch (err) {
        if (!isProviderError(err)) throw err;
        if (isAuthFailure(err)) {
          emit?.("ai:auth-failed", { providerId: accepted.target.providerId });
          throw err;
        }
        if (isCancellation(err)) throw err;
        if (!err.retryable) throw err;
        if (!accepted.target.fallback) throw err;
        target = accepted.target.fallback;
      }
    }
  }
}
