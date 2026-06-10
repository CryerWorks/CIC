import { describe, it, expect, vi } from "vitest";
import { defaultRouter } from "./routerImpl";
import { ProviderError, isProviderError } from "./errors";
import type { AIConfig, RoleTarget } from "./config";
import type { Provider, ProviderCapabilities } from "./provider";

function makeProvider(
  id: string,
  caps: Partial<ProviderCapabilities>,
  embedImpl?: () => Promise<{ vectors: number[][]; model: string; dimensions: number }>,
): Provider {
  const baseCaps: ProviderCapabilities = {
    chat: true,
    embeddings: true,
    streaming: true,
    tools: false,
    isLocal: true,
    ...caps,
  };
  return {
    id,
    type: "ollama",
    capabilities: () => baseCaps,
    async probe() {
      return { ...baseCaps, latencyMs: 1 };
    },
    async *chat() {
      yield { delta: `${id}-chat`, done: true };
    },
    async embed() {
      if (embedImpl) return embedImpl();
      return { vectors: [[1, 2]], model: `${id}-embed`, dimensions: 2 };
    },
  };
}

function chain(...steps: Array<{ providerId: string; model: string }>): RoleTarget {
  let acc: RoleTarget | undefined;
  for (let i = steps.length - 1; i >= 0; i--) {
    acc = { ...steps[i], fallback: acc };
  }
  return acc!;
}

describe("router embed re-route (privacy-preserving)", () => {
  it("embeddings role's primary lacks embeddings + chain has local-embeddings → re-routes to the local-embeddings provider", async () => {
    const target = chain(
      { providerId: "openai", model: "any" },
      { providerId: "ollama-local", model: "nomic" },
    );
    const config: AIConfig = {
      providers: [],
      routing: { reasoning: null, drafting: null, embeddings: target },
      lockdown: false,
      version: 1,
    };
    const openaiSpy = vi.fn();
    const ollamaSpy = vi.fn();
    const providers = new Map<string, Provider>([
      [
        "openai",
        makeProvider("openai", { embeddings: false }, async () => {
          openaiSpy();
          return { vectors: [[1]], model: "x", dimensions: 1 };
        }),
      ],
      [
        "ollama-local",
        makeProvider("ollama-local", { isLocal: true, embeddings: true }, async () => {
          ollamaSpy();
          return { vectors: [[3, 4]], model: "nomic", dimensions: 2 };
        }),
      ],
    ]);
    const router = defaultRouter({ config, providers });

    const result = await router.embed("embeddings", ["chunk"], { containsVaultContent: false });
    expect(result.model).toBe("nomic");
    expect(openaiSpy).not.toHaveBeenCalled();
    expect(ollamaSpy).toHaveBeenCalledTimes(1);
  });

  it("no local-embeddings step in the chain → falls through to the primary's embed (which throws unsupported → walk fallback)", async () => {
    const target = chain({ providerId: "openai", model: "any" });
    const config: AIConfig = {
      providers: [],
      routing: { reasoning: null, drafting: null, embeddings: target },
      lockdown: false,
      version: 1,
    };
    const providers = new Map<string, Provider>([
      [
        "openai",
        makeProvider("openai", { embeddings: false }, async () => {
          // We claim no embeddings; the adapter would throw unsupported. Simulate it.
          throw new ProviderError("unsupported", "openai", "no embeddings", true);
        }),
      ],
    ]);
    const router = defaultRouter({ config, providers });

    let thrown: unknown = null;
    try {
      await router.embed("embeddings", ["x"], { containsVaultContent: false });
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
  });
});

describe("router C1 regression — embed re-route does NOT bypass the lockdown gate (L2)", () => {
  it("lockdown ON + vault content + primary = Anthropic (no embeddings, remote, no fallback) → BLOCKED at gate; re-route never considered", async () => {
    const target = chain({ providerId: "anthropic", model: "claude" });
    const config: AIConfig = {
      providers: [],
      routing: { reasoning: null, drafting: null, embeddings: target },
      lockdown: true,
      version: 1,
    };
    const anthropicSpy = vi.fn();
    const ollamaSpy = vi.fn();
    const providers = new Map<string, Provider>([
      [
        "anthropic",
        {
          id: "anthropic",
          type: "anthropic",
          capabilities: () => ({ chat: true, embeddings: false, streaming: true, tools: false, isLocal: false }),
          async probe() {
            return { chat: true, embeddings: false, streaming: true, tools: false, isLocal: false, latencyMs: 1 };
          },
          async *chat() {
            yield { delta: "", done: true };
          },
          async embed() {
            anthropicSpy();
            throw new ProviderError("unsupported", "anthropic", "no embeddings", true);
          },
        },
      ],
      [
        "ollama-local",
        makeProvider("ollama-local", { isLocal: true, embeddings: true }, async () => {
          ollamaSpy();
          return { vectors: [[1]], model: "nomic", dimensions: 1 };
        }),
      ],
    ]);
    const router = defaultRouter({ config, providers });

    let thrown: unknown = null;
    try {
      await router.embed("embeddings", ["vault chunk"], { containsVaultContent: true });
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) expect(thrown.kind).toBe("unsupported");
    // Critical: neither provider's embed was invoked. The gate blocked the call before any
    // dispatch / re-route logic ran.
    expect(anthropicSpy).not.toHaveBeenCalled();
    expect(ollamaSpy).not.toHaveBeenCalled();
  });

  it("[Anthropic → OllamaLocal] with lockdown ON + vault content → gate skips Anthropic, lands on OllamaLocal which serves", async () => {
    const target = chain(
      { providerId: "anthropic", model: "claude" },
      { providerId: "ollama-local", model: "nomic" },
    );
    const config: AIConfig = {
      providers: [],
      routing: { reasoning: null, drafting: null, embeddings: target },
      lockdown: true,
      version: 1,
    };
    const anthropicSpy = vi.fn();
    const ollamaSpy = vi.fn();
    const providers = new Map<string, Provider>([
      [
        "anthropic",
        {
          id: "anthropic",
          type: "anthropic",
          capabilities: () => ({ chat: true, embeddings: false, streaming: true, tools: false, isLocal: false }),
          async probe() {
            return { chat: true, embeddings: false, streaming: true, tools: false, isLocal: false, latencyMs: 1 };
          },
          async *chat() {
            yield { delta: "", done: true };
          },
          async embed() {
            anthropicSpy();
            throw new ProviderError("unsupported", "anthropic", "no embeddings", true);
          },
        },
      ],
      [
        "ollama-local",
        makeProvider("ollama-local", { isLocal: true, embeddings: true }, async () => {
          ollamaSpy();
          return { vectors: [[1]], model: "nomic-served", dimensions: 1 };
        }),
      ],
    ]);
    const router = defaultRouter({ config, providers });
    const result = await router.embed("embeddings", ["chunk"], { containsVaultContent: true });
    expect(result.model).toBe("nomic-served");
    expect(anthropicSpy).not.toHaveBeenCalled();
    expect(ollamaSpy).toHaveBeenCalledTimes(1);
  });
});
