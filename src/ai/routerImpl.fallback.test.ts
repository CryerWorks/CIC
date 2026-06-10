import { describe, it, expect, vi } from "vitest";
import { defaultRouter } from "./routerImpl";
import { ProviderError, isProviderError } from "./errors";
import type { AIConfig, RoleTarget } from "./config";
import type { Provider, ChatChunk, ProviderCapabilities } from "./provider";

function makeProvider(
  id: string,
  behavior: { throws?: ProviderError; text?: string },
  caps: Partial<ProviderCapabilities> = {},
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
      if (behavior.throws) throw behavior.throws;
      yield { delta: behavior.text ?? `from ${id}`, done: false };
      yield { delta: "", done: true };
    },
    async embed(texts) {
      if (behavior.throws) throw behavior.throws;
      return { vectors: texts.map(() => [1]), model: "f", dimensions: 1 };
    },
  };
}

function chain(...steps: Array<{ providerId: string; model: string }>): RoleTarget {
  if (steps.length === 0) throw new Error("at least one step");
  let acc: RoleTarget | undefined;
  for (let i = steps.length - 1; i >= 0; i--) {
    acc = { ...steps[i], fallback: acc };
  }
  return acc!;
}

function configWith(target: RoleTarget): AIConfig {
  return {
    providers: [],
    routing: { reasoning: target, drafting: null, embeddings: null },
    lockdown: false,
    version: 1,
  };
}

async function consumeChat(it: AsyncIterable<ChatChunk>): Promise<string> {
  let out = "";
  for await (const c of it) out += c.delta;
  return out;
}

describe("router fallback walk (FR-008)", () => {
  it("retryable rate_limit on primary → secondary serves", async () => {
    const t = chain({ providerId: "A", model: "a" }, { providerId: "B", model: "b" });
    const providers = new Map<string, Provider>([
      ["A", makeProvider("A", { throws: new ProviderError("rate_limit", "A", "throttled", true) })],
      ["B", makeProvider("B", { text: "B-served" })],
    ]);
    const router = defaultRouter({ config: configWith(t), providers });
    const result = await consumeChat(router.chat("reasoning", [], { containsVaultContent: false }));
    expect(result).toContain("B-served");
  });

  it.each(["timeout", "offline", "unsupported"] as const)("retryable %s walks the chain", async (kind) => {
    const t = chain({ providerId: "A", model: "a" }, { providerId: "B", model: "b" });
    const providers = new Map<string, Provider>([
      ["A", makeProvider("A", { throws: new ProviderError(kind, "A", "boom", true) })],
      ["B", makeProvider("B", { text: "B" })],
    ]);
    const router = defaultRouter({ config: configWith(t), providers });
    const result = await consumeChat(router.chat("reasoning", [], { containsVaultContent: false }));
    expect(result).toContain("B");
  });

  it.each(["bad_response", "auth", "cancelled", "unknown"] as const)(
    "non-retryable %s surfaces immediately (no fallback consulted)",
    async (kind) => {
      const t = chain({ providerId: "A", model: "a" }, { providerId: "B", model: "b" });
      const bSpy = vi.fn();
      const aErr = new ProviderError(kind, "A", `${kind} on A`, false);
      const providers = new Map<string, Provider>([
        ["A", makeProvider("A", { throws: aErr })],
        ["B", {
          ...makeProvider("B", { text: "B-should-not-fire" }),
          async *chat() {
            bSpy();
            yield { delta: "", done: true };
          },
        } as Provider],
      ]);
      const router = defaultRouter({ config: configWith(t), providers });
      let thrown: unknown = null;
      try {
        await consumeChat(router.chat("reasoning", [], { containsVaultContent: false }));
      } catch (e) {
        thrown = e;
      }
      expect(isProviderError(thrown)).toBe(true);
      if (isProviderError(thrown)) expect(thrown.kind).toBe(kind);
      expect(bSpy).not.toHaveBeenCalled();
    },
  );

  it("chain fully fails on retryable errors → surfaces the LAST error from the tail", async () => {
    const t = chain(
      { providerId: "A", model: "a" },
      { providerId: "B", model: "b" },
      { providerId: "C", model: "c" },
    );
    const providers = new Map<string, Provider>([
      ["A", makeProvider("A", { throws: new ProviderError("offline", "A", "A is offline", true) })],
      ["B", makeProvider("B", { throws: new ProviderError("offline", "B", "B is offline", true) })],
      ["C", makeProvider("C", { throws: new ProviderError("offline", "C", "C is offline", true) })],
    ]);
    const router = defaultRouter({ config: configWith(t), providers });
    let thrown: unknown = null;
    try {
      await consumeChat(router.chat("reasoning", [], { containsVaultContent: false }));
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) expect(thrown.providerId).toBe("C");
  });

  it("'ai:auth-failed' is emitted on auth error", async () => {
    const t = chain({ providerId: "A", model: "a" });
    const providers = new Map<string, Provider>([
      ["A", makeProvider("A", { throws: new ProviderError("auth", "A", "bad key", false) })],
    ]);
    const events: string[] = [];
    const router = defaultRouter({
      config: configWith(t),
      providers,
      emit: (event, payload) => {
        if (event === "ai:auth-failed") events.push(payload.providerId);
      },
    });
    try {
      await consumeChat(router.chat("reasoning", [], { containsVaultContent: false }));
    } catch {
      // expected
    }
    expect(events).toEqual(["A"]);
  });
});

describe("router C1 regression — per-step lockdown on the fallback walk", () => {
  it("[local→remote] chain with lockdown ON + vault content: local fails retryably → remote step is BLOCKED (never invoked)", async () => {
    const t = chain({ providerId: "local", model: "l" }, { providerId: "remote", model: "r" });
    const config: AIConfig = {
      providers: [],
      routing: { reasoning: t, drafting: null, embeddings: null },
      lockdown: true,
      version: 1,
    };
    const remoteSpy = vi.fn();
    const remoteProvider: Provider = {
      id: "remote",
      type: "ollama",
      capabilities: () => ({ chat: true, embeddings: true, streaming: true, tools: false, isLocal: false }),
      async probe() {
        return { chat: true, embeddings: true, streaming: true, tools: false, isLocal: false, latencyMs: 1 };
      },
      async *chat() {
        remoteSpy();
        yield { delta: "REMOTE LEAKED VAULT", done: true };
      },
      async embed() {
        remoteSpy();
        return { vectors: [], model: "", dimensions: 0 };
      },
    };
    const providers = new Map<string, Provider>([
      [
        "local",
        makeProvider(
          "local",
          { throws: new ProviderError("offline", "local", "Ollama is offline", true) },
          { isLocal: true },
        ),
      ],
      ["remote", remoteProvider],
    ]);
    const router = defaultRouter({ config, providers });

    let thrown: unknown = null;
    try {
      await consumeChat(router.chat("reasoning", [{ role: "user", content: "vault note text" }], { containsVaultContent: true }));
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) {
      // The walker stepped from the failed local to the remote step, the gate tripped, and
      // surfaced the lockdown error.
      expect(thrown.kind).toBe("unsupported");
      expect(thrown.message).toMatch(/local-only lockdown/);
    }
    // Privacy invariant: the remote provider's chat was NEVER invoked.
    expect(remoteSpy).not.toHaveBeenCalled();
  });

  it("same C1 regression on embed: remote step is BLOCKED (never invoked)", async () => {
    const t = chain({ providerId: "local", model: "l" }, { providerId: "remote", model: "r" });
    const config: AIConfig = {
      providers: [],
      routing: { reasoning: null, drafting: null, embeddings: t },
      lockdown: true,
      version: 1,
    };
    const remoteSpy = vi.fn();
    const providers = new Map<string, Provider>([
      [
        "local",
        makeProvider(
          "local",
          { throws: new ProviderError("offline", "local", "Ollama is offline", true) },
          { isLocal: true },
        ),
      ],
      [
        "remote",
        {
          id: "remote",
          type: "ollama",
          capabilities: () => ({ chat: true, embeddings: true, streaming: true, tools: false, isLocal: false }),
          async probe() {
            return { chat: true, embeddings: true, streaming: true, tools: false, isLocal: false, latencyMs: 1 };
          },
          async *chat() {
            yield { delta: "", done: true };
          },
          async embed() {
            remoteSpy();
            return { vectors: [[1]], model: "leaked", dimensions: 1 };
          },
        } as Provider,
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
    expect(remoteSpy).not.toHaveBeenCalled();
  });
});
