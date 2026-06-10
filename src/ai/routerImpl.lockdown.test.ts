import { describe, it, expect, vi } from "vitest";
import { defaultRouter } from "./routerImpl";
import { ProviderError, isProviderError } from "./errors";
import type { AIConfig, RoleTarget } from "./config";
import type { Provider, ProviderCapabilities, ChatChunk } from "./provider";

// ─── helpers ───────────────────────────────────────────────────────

function fakeProvider(
  id: string,
  caps: Partial<ProviderCapabilities>,
  chatImpl?: (msgs: unknown) => AsyncIterable<ChatChunk>,
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
      if (chatImpl) {
        yield* chatImpl([]);
        return;
      }
      yield { delta: `hello from ${id}`, done: false };
      yield { delta: "", done: true };
    },
    async embed(texts) {
      return { vectors: texts.map(() => [0.1, 0.2]), model: "fake-embed", dimensions: 2 };
    },
  };
}

function configWith(target: RoleTarget | null, lockdown: boolean): AIConfig {
  return {
    providers: [],
    routing: { reasoning: target, drafting: null, embeddings: null },
    lockdown,
    version: 1,
  };
}

async function consumeChat(it: AsyncIterable<ChatChunk>): Promise<string> {
  let out = "";
  for await (const c of it) out += c.delta;
  return out;
}

// ─── tests ───────────────────────────────────────────────────────

describe("router lockdown gate (FR-012 / Constitution II)", () => {
  it("(1) vault content + lockdown ON + remote primary + no fallback → throws unsupported non-retryable", async () => {
    const config = configWith({ providerId: "remote", model: "m" }, true);
    const providers = new Map<string, Provider>([
      ["remote", fakeProvider("remote", { isLocal: false })],
    ]);
    const router = defaultRouter({ config, providers });
    let thrown: unknown = null;
    try {
      await consumeChat(router.chat("reasoning", [{ role: "user", content: "x" }], { containsVaultContent: true }));
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) {
      expect(thrown.kind).toBe("unsupported");
      expect(thrown.retryable).toBe(false);
      expect(thrown.message).toMatch(/local-only lockdown/);
    }
  });

  it("(2) vault content + lockdown ON + local primary → passes through", async () => {
    const config = configWith({ providerId: "local", model: "m" }, true);
    const providers = new Map<string, Provider>([
      ["local", fakeProvider("local", { isLocal: true })],
    ]);
    const router = defaultRouter({ config, providers });
    const result = await consumeChat(
      router.chat("reasoning", [{ role: "user", content: "x" }], { containsVaultContent: true }),
    );
    expect(result).toMatch(/hello from local/);
  });

  it("(3) NO vault content + lockdown ON + remote primary → passes through (gate doesn't trip on non-vault content)", async () => {
    const config = configWith({ providerId: "remote", model: "m" }, true);
    const providers = new Map<string, Provider>([
      ["remote", fakeProvider("remote", { isLocal: false })],
    ]);
    const router = defaultRouter({ config, providers });
    const result = await consumeChat(
      router.chat("reasoning", [{ role: "user", content: "x" }], { containsVaultContent: false }),
    );
    expect(result).toMatch(/hello from remote/);
  });

  it("(4) gate trips on embed identically to chat", async () => {
    const config = configWith({ providerId: "remote", model: "m" }, true);
    config.routing.embeddings = { providerId: "remote", model: "m" };
    const providers = new Map<string, Provider>([
      ["remote", fakeProvider("remote", { isLocal: false })],
    ]);
    const router = defaultRouter({ config, providers });
    let thrown: unknown = null;
    try {
      await router.embed("embeddings", ["a"], { containsVaultContent: true });
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) expect(thrown.kind).toBe("unsupported");
  });

  it("(5) per-step regression — [remote → local] chain serves from local under lockdown", async () => {
    const chain: RoleTarget = {
      providerId: "remote",
      model: "r",
      fallback: { providerId: "local", model: "l" },
    };
    const config = configWith(chain, true);
    const remoteSpy = vi.fn();
    const remoteProvider: Provider = {
      ...fakeProvider("remote", { isLocal: false }),
      async *chat() {
        remoteSpy();
        yield { delta: "REMOTE SHOULD NOT FIRE", done: false };
        yield { delta: "", done: true };
      },
    };
    const providers = new Map<string, Provider>([
      ["remote", remoteProvider],
      ["local", fakeProvider("local", { isLocal: true })],
    ]);
    const router = defaultRouter({ config, providers });
    const result = await consumeChat(
      router.chat("reasoning", [{ role: "user", content: "x" }], { containsVaultContent: true }),
    );
    // Gate skipped remote → landed on local.
    expect(result).toMatch(/hello from local/);
    expect(remoteSpy).not.toHaveBeenCalled();
  });
});

describe("router role resolution", () => {
  it("unassigned role → throws unsupported 'role unassigned'", async () => {
    const config = configWith(null, false);
    const providers = new Map<string, Provider>();
    const router = defaultRouter({ config, providers });
    let thrown: unknown = null;
    try {
      await consumeChat(router.chat("reasoning", [], { containsVaultContent: false }));
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) {
      expect(thrown.kind).toBe("unsupported");
      expect(thrown.message).toMatch(/unassigned/);
    }
  });

  it("provider missing from the providers map → throws unsupported 'not loaded'", async () => {
    const config = configWith({ providerId: "missing", model: "m" }, false);
    const providers = new Map<string, Provider>();
    const router = defaultRouter({ config, providers });
    let thrown: unknown = null;
    try {
      await consumeChat(router.chat("reasoning", [], { containsVaultContent: false }));
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) {
      expect(thrown.kind).toBe("unsupported");
      expect(thrown.message).toMatch(/not loaded/);
    }
  });
});

describe("router probe cache", () => {
  it("first call hits provider.probe(); second (no force) returns cached; force re-hits", async () => {
    const probeSpy = vi.fn(async () => ({
      chat: true,
      embeddings: true,
      streaming: true,
      tools: false,
      isLocal: true,
      latencyMs: 7,
    }));
    const provider: Provider = {
      id: "ollama-local",
      type: "ollama",
      capabilities: () => ({
        chat: true,
        embeddings: true,
        streaming: true,
        tools: false,
        isLocal: true,
      }),
      probe: probeSpy,
      async *chat() {
        yield { delta: "", done: true };
      },
      async embed() {
        return { vectors: [], model: "", dimensions: 0 };
      },
    };
    const config: AIConfig = {
      providers: [{ id: "ollama-local", type: "ollama", label: "L", baseUrl: "http://localhost:11434" }],
      routing: { reasoning: null, drafting: null, embeddings: null },
      lockdown: false,
      version: 1,
    };
    const router = defaultRouter({ config, providers: new Map([["ollama-local", provider]]) });
    const first = await router.probe("ollama-local");
    expect(first.latencyMs).toBe(7);
    await router.probe("ollama-local");
    expect(probeSpy).toHaveBeenCalledTimes(1);
    await router.probe("ollama-local", { force: true });
    expect(probeSpy).toHaveBeenCalledTimes(2);
  });

  it("config version change invalidates the cache", async () => {
    const provider = fakeProvider("ollama-local", { isLocal: true });
    const configV1: AIConfig = {
      providers: [{ id: "ollama-local", type: "ollama", label: "L", baseUrl: "http://localhost:11434" }],
      routing: { reasoning: null, drafting: null, embeddings: null },
      lockdown: false,
      version: 1,
    };
    const r1 = defaultRouter({ config: configV1, providers: new Map([["ollama-local", provider]]) });
    await r1.probe("ollama-local");

    const configV2 = { ...configV1, version: 2 };
    const r2 = defaultRouter({ config: configV2, providers: new Map([["ollama-local", provider]]) });
    const spy = vi.spyOn(provider, "probe");
    spy.mockClear();
    await r2.probe("ollama-local");
    expect(spy).toHaveBeenCalled();
  });

  it("probe on a missing provider throws unsupported", async () => {
    const config = configWith(null, false);
    const router = defaultRouter({ config, providers: new Map() });
    await expect(router.probe("missing")).rejects.toBeInstanceOf(ProviderError);
  });

  it("probe propagates ProviderError thrown by the adapter (e.g., offline)", async () => {
    const provider: Provider = {
      id: "ollama-local",
      type: "ollama",
      capabilities: () => ({
        chat: true,
        embeddings: true,
        streaming: true,
        tools: false,
        isLocal: true,
      }),
      async probe() {
        throw new ProviderError("offline", "ollama-local", "couldn't reach", true);
      },
      async *chat() {
        yield { delta: "", done: true };
      },
      async embed() {
        return { vectors: [], model: "", dimensions: 0 };
      },
    };
    const config: AIConfig = {
      providers: [{ id: "ollama-local", type: "ollama", label: "L", baseUrl: "http://localhost:11434" }],
      routing: { reasoning: null, drafting: null, embeddings: null },
      lockdown: false,
      version: 1,
    };
    const router = defaultRouter({ config, providers: new Map([["ollama-local", provider]]) });
    await expect(router.probe("ollama-local", { force: true })).rejects.toBeInstanceOf(ProviderError);
  });
});
