import { describe, it, expect, vi } from "vitest";
import { runAdapterContract } from "../testing/contract";
import { streamChunks, fakeFetch, InMemorySecretStore } from "../testing/fakeFetch";
import { AnthropicAdapter } from "./anthropic";
import { isProviderError } from "../errors";

// The shared contract tests (streaming, AbortSignal, error mapping, isLocal, secret discipline).
// Anthropic doesn't support `embed`, so `supportsEmbed: false`.
runAdapterContract([
  {
    name: "AnthropicAdapter",
    needsApiKey: true,
    baseUrl: "https://api.anthropic.com",
    testModel: "claude-3-5-sonnet-20241022",
    // Anthropic's `baseUrl` is hardcoded in the adapter; we still pass the canonical URL so
    // expectIsLocal returns the right value (false).
    expectIsLocal: () => false,
    makeAdapter: ({ fetchFn, secrets, apiKeyRef }) =>
      new AnthropicAdapter({
        id: "provider-id",
        apiKeyRef: apiKeyRef!,
        secrets,
        fetchFn,
        // Required for `probe()` — Anthropic's probe is a 1-token POST against the default model.
        defaultModel: "claude-3-5-sonnet-20241022",
      }),
    vendor: {
      supportsEmbed: false,
      embedBatched: false,
      chatChunkOk: () =>
        streamChunks([
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
          'data: {"type":"message_stop"}\n\n',
        ]),
      chatTerminalOnly: () => streamChunks(['data: {"type":"message_stop"}\n\n']),
      embedOkBody: () => ({}),
      authErrorResponse: () => ({ status: 401, body: { error: "invalid key" } }),
      rateLimitResponse: () => ({ status: 429, body: {} }),
      badResponseResponse: () => ({ status: 200, body: "not sse" }),
      probeOkBody: () => ({ type: "message", content: [{ type: "text", text: "ok" }] }),
    },
  },
]);

// Adapter-specific assertions: system-prompt translation + embed-unsupported.
describe("AnthropicAdapter — system prompt translation + embed", () => {
  it("translates ChatMessage[] system entries into the top-level `system` field", async () => {
    const secrets = new InMemorySecretStore();
    await secrets.set("anthropic", "sk-test");
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn = fakeFetch({
      expectMethod: "POST",
      expectUrl: "https://api.anthropic.com/v1/messages",
      expectHeaders: { "x-api-key": "sk-test", "anthropic-version": "2023-06-01" },
      expectBody: (b) => {
        capturedBody = b as Record<string, unknown>;
      },
      response: {
        stream: streamChunks(['data: {"type":"message_stop"}\n\n']),
      },
    });
    const adapter = new AnthropicAdapter({ id: "anthropic", apiKeyRef: "anthropic", secrets, fetchFn });
    const out: string[] = [];
    for await (const c of adapter.chat(
      [
        { role: "system", content: "You are concise." },
        { role: "user", content: "Hi" },
      ],
      { containsVaultContent: false, model: "claude" },
    )) {
      out.push(c.delta);
    }
    expect(capturedBody).toBeDefined();
    expect(capturedBody?.system).toBe("You are concise.");
    expect(capturedBody?.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("embed throws ProviderError('unsupported', …, retryable:true) so the router's embed re-route fires", async () => {
    const secrets = new InMemorySecretStore();
    await secrets.set("anthropic", "sk-test");
    const adapter = new AnthropicAdapter({
      id: "anthropic",
      apiKeyRef: "anthropic",
      secrets,
      fetchFn: vi.fn() as unknown as typeof fetch,
    });
    let thrown: unknown = null;
    try {
      await adapter.embed(["x"], { containsVaultContent: false, model: "any" });
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) {
      expect(thrown.kind).toBe("unsupported");
      expect(thrown.retryable).toBe(true);
    }
  });
});
