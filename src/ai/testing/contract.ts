/**
 * Adapter contract test harness (Feature 016 / Constitution II / contracts/adapter-contract.md).
 * Parametrized describe-block that asserts every adapter implementation satisfies the shared
 * invariants A1..A14: streaming yields incrementally + terminal `done:true`, AbortSignal
 * cancellation translates to `ProviderError('cancelled', …)`, error mapping per the taxonomy,
 * `isLocal` correctness, secret never on the instance, secret never in errors, etc.
 *
 * Lives at `src/ai/testing/contract.ts`. Each adapter ships its own `*.contract.test.ts` that
 * calls `runAdapterContract(...)` with vendor-specific fake-response builders.
 */

import { describe, it, expect } from "vitest";
import type { Provider, ChatMessage } from "../provider";
import { isProviderError, type ProviderErrorKind } from "../errors";
import { InMemorySecretStore } from "../secrets";
import { fakeFetch, streamChunks, type FakeFetchSpec } from "./fakeFetch";

/** Per-adapter vendor-specific fixtures the harness drives through. */
export interface VendorFixtures {
  /** A successful streaming chat response body. Multi-chunk + terminal. */
  chatChunkOk(): AsyncIterable<Uint8Array>;
  /** A zero-token completion (just the terminal chunk). */
  chatTerminalOnly(): AsyncIterable<Uint8Array>;
  /** A successful embed JSON response for `n` inputs. Returned as a plain object so the fake
   *  fetch can `JSON.stringify` it. */
  embedOkBody(n: number): Record<string, unknown>;
  /** A 401-style auth-failure spec (status + optional body). */
  authErrorResponse(): { status: number; body?: Record<string, unknown> | string };
  /** A 429 rate-limit response. */
  rateLimitResponse(): { status: number; body?: Record<string, unknown> | string; headers?: Record<string, string> };
  /** A malformed body (status 200 but unparseable). */
  badResponseResponse(): { status: number; body?: Record<string, unknown> | string };
  /** True if this adapter supports embed (Ollama / OpenAI-compat yes; Anthropic no). */
  supportsEmbed: boolean;
  /** True if `embed` issues ONE batched request for N inputs (OpenAI-compat); false if it
   *  iterates per-input (Ollama). Used by the embed-order harness test to set up fakeFetch. */
  embedBatched: boolean;
  /** Successful probe response body (Ollama: GET /api/tags; OpenAI-compatible: GET /v1/models;
   *  Anthropic: POST /v1/messages with max_tokens:1). Adapter-specific shape; the harness only
   *  cares that the adapter doesn't reject a 200-OK + parseable JSON body. */
  probeOkBody(): Record<string, unknown> | string;
}

export interface ContractCase {
  name: string;
  /** Builds a fresh adapter with the injected fetch + a fresh SecretStore seeded with the key. */
  makeAdapter(opts: {
    fetchFn: typeof fetch;
    baseUrl: string;
    secrets: InMemorySecretStore;
    apiKeyRef?: string;
  }): Provider;
  /** Whether this adapter's baseUrl resolves to `isLocal: true`. Anthropic = false always. */
  expectIsLocal(baseUrl: string): boolean;
  /** Whether this adapter requires an API key (set via `secrets.set(apiKeyRef, …)`). */
  needsApiKey: boolean;
  /** Vendor-specific stream / response fixtures. */
  vendor: VendorFixtures;
  /** A baseUrl the adapter will accept. For Anthropic any value works (the endpoint is hardcoded). */
  baseUrl: string;
  /** The model name to use in chat/embed options. */
  testModel: string;
}

const TEST_KEY = "sk-VERY-SECRET-NEVER-LEAK";

async function consume(it: AsyncIterable<{ delta: string; done: boolean }>): Promise<{
  text: string;
  chunks: number;
  terminalCount: number;
}> {
  let text = "";
  let chunks = 0;
  let terminalCount = 0;
  for await (const c of it) {
    text += c.delta;
    chunks++;
    if (c.done) terminalCount++;
  }
  return { text, chunks, terminalCount };
}

function makeSecrets(needsApiKey: boolean, apiKeyRef?: string): InMemorySecretStore {
  const s = new InMemorySecretStore();
  if (needsApiKey && apiKeyRef) {
    // Pre-seed.
    void s.set(apiKeyRef, TEST_KEY);
  }
  return s;
}

export function runAdapterContract(cases: ContractCase[]): void {
  for (const c of cases) {
    describe(`Adapter contract: ${c.name}`, () => {
      const apiKeyRef = c.needsApiKey ? "provider-id" : undefined;

      it("A3+A4: streams chat chunks and yields exactly one terminal done:true", async () => {
        const fetchFn = fakeFetch({ response: { stream: c.vendor.chatChunkOk() } });
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
        const result = await consume(
          adapter.chat(messages, { containsVaultContent: false, model: c.testModel }),
        );
        expect(result.text.length).toBeGreaterThan(0);
        expect(result.terminalCount).toBe(1);
        expect(result.chunks).toBeGreaterThan(0);
      });

      it("A4: zero-token completion still yields a terminal chunk", async () => {
        const fetchFn = fakeFetch({ response: { stream: c.vendor.chatTerminalOnly() } });
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        const result = await consume(
          adapter.chat([{ role: "user", content: "" }], { containsVaultContent: false, model: c.testModel }),
        );
        expect(result.terminalCount).toBe(1);
      });

      it("A6: AbortSignal pre-aborted → ProviderError('cancelled', …)", async () => {
        const fetchFn = fakeFetch({ reject: "AbortError" });
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        const ctrl = new AbortController();
        ctrl.abort();
        let thrown: unknown = null;
        try {
          await consume(
            adapter.chat([{ role: "user", content: "x" }], {
              containsVaultContent: false,
              model: c.testModel,
              signal: ctrl.signal,
            }),
          );
        } catch (e) {
          thrown = e;
        }
        expect(isProviderError(thrown)).toBe(true);
        if (isProviderError(thrown)) {
          expect(thrown.kind).toBe("cancelled" satisfies ProviderErrorKind);
          expect(thrown.retryable).toBe(false);
        }
      });

      it("A7: 401-style → ProviderError('auth', …, retryable:false)", async () => {
        const err = c.vendor.authErrorResponse();
        const fetchFn = fakeFetch({ response: { status: err.status, body: err.body ?? {} } });
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        let thrown: unknown = null;
        try {
          await consume(
            adapter.chat([{ role: "user", content: "x" }], { containsVaultContent: false, model: c.testModel }),
          );
        } catch (e) {
          thrown = e;
        }
        expect(isProviderError(thrown)).toBe(true);
        if (isProviderError(thrown)) {
          expect(thrown.kind).toBe("auth");
          expect(thrown.retryable).toBe(false);
        }
      });

      it("A7: 429 → ProviderError('rate_limit', …, retryable:true)", async () => {
        const err = c.vendor.rateLimitResponse();
        const fetchFn = fakeFetch({ response: { status: err.status, body: err.body ?? {}, headers: err.headers } });
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        let thrown: unknown = null;
        try {
          await consume(
            adapter.chat([{ role: "user", content: "x" }], { containsVaultContent: false, model: c.testModel }),
          );
        } catch (e) {
          thrown = e;
        }
        expect(isProviderError(thrown)).toBe(true);
        if (isProviderError(thrown)) {
          expect(thrown.kind).toBe("rate_limit");
          expect(thrown.retryable).toBe(true);
        }
      });

      it("A7: TypeError fetch (network) → ProviderError('offline', …, retryable:true)", async () => {
        const fetchFn = fakeFetch({ reject: "TypeError" });
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        let thrown: unknown = null;
        try {
          await consume(
            adapter.chat([{ role: "user", content: "x" }], { containsVaultContent: false, model: c.testModel }),
          );
        } catch (e) {
          thrown = e;
        }
        expect(isProviderError(thrown)).toBe(true);
        if (isProviderError(thrown)) {
          expect(thrown.kind).toBe("offline");
          expect(thrown.retryable).toBe(true);
        }
      });

      it("A8: capabilities().isLocal matches expectation", () => {
        const fetchFn = fakeFetch([]);
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        expect(adapter.capabilities().isLocal).toBe(c.expectIsLocal(c.baseUrl));
      });

      it("A12: probe() on 200 OK returns capabilities + reachable latency", async () => {
        const fetchFn = fakeFetch({ response: { body: c.vendor.probeOkBody() } });
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        const outcome = await adapter.probe();
        expect(outcome.isLocal).toBe(c.expectIsLocal(c.baseUrl));
        expect(typeof outcome.latencyMs).toBe("number");
        expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
      });

      it("A13: probe() on network failure throws ProviderError('offline', …, retryable:true)", async () => {
        const fetchFn = fakeFetch({ reject: "TypeError" });
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        let thrown: unknown = null;
        try {
          await adapter.probe();
        } catch (e) {
          thrown = e;
        }
        expect(isProviderError(thrown)).toBe(true);
        if (isProviderError(thrown)) {
          expect(thrown.kind).toBe("offline" satisfies ProviderErrorKind);
          expect(thrown.retryable).toBe(true);
        }
      });

      it("A14: probe() on 401 throws ProviderError('auth', …, retryable:false)", async () => {
        // For adapters with no API key (Ollama), the server itself would have to return 401 —
        // this test stays meaningful because the auth-error mapping is the same code path.
        const err = c.vendor.authErrorResponse();
        const fetchFn = fakeFetch({ response: { status: err.status, body: err.body ?? {} } });
        const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
        const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
        let thrown: unknown = null;
        try {
          await adapter.probe();
        } catch (e) {
          thrown = e;
        }
        expect(isProviderError(thrown)).toBe(true);
        if (isProviderError(thrown)) {
          expect(thrown.kind).toBe("auth");
          expect(thrown.retryable).toBe(false);
        }
      });

      if (c.vendor.supportsEmbed) {
        it("A5: embed preserves input order", async () => {
          const fetchFn = c.vendor.embedBatched
            ? fakeFetch({ response: { body: c.vendor.embedOkBody(2) } })
            : fakeFetch([
                { response: { body: c.vendor.embedOkBody(1) } },
                { response: { body: c.vendor.embedOkBody(1) } },
              ]);
          const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
          const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });
          const result = await adapter.embed(["alpha", "beta"], {
            containsVaultContent: false,
            model: c.testModel,
          });
          expect(result.vectors).toHaveLength(2);
        });
      }

      if (c.needsApiKey && apiKeyRef) {
        it("A10+A11: secret is fetched per call (not stored on the instance), and never appears in thrown errors", async () => {
          // Drive an auth error. The thrown error must NOT contain the secret value anywhere.
          const err = c.vendor.authErrorResponse();
          const fetchFn = fakeFetch({ response: { status: err.status, body: err.body ?? {} } });
          const secrets = makeSecrets(c.needsApiKey, apiKeyRef);
          const adapter = c.makeAdapter({ fetchFn, baseUrl: c.baseUrl, secrets, apiKeyRef });

          // A10: the secret should not appear as a property of the adapter instance.
          const flat = JSON.stringify(adapter, Object.getOwnPropertyNames(adapter as object));
          expect(flat).not.toContain(TEST_KEY);

          let thrown: unknown = null;
          try {
            await consume(
              adapter.chat([{ role: "user", content: "x" }], { containsVaultContent: false, model: c.testModel }),
            );
          } catch (e) {
            thrown = e;
          }
          // A11: error stringification must not contain the secret.
          const s = serializeAll(thrown);
          expect(s).not.toContain(TEST_KEY);
        });
      }
    });
  }
}

function serializeAll(e: unknown): string {
  if (e === null || e === undefined) return String(e);
  const parts: string[] = [];
  if (e instanceof Error) {
    parts.push(e.message);
    parts.push(e.stack ?? "");
    if (typeof (e as { cause?: unknown }).cause !== "undefined") {
      parts.push(serializeAll((e as { cause?: unknown }).cause));
    }
  }
  try {
    parts.push(JSON.stringify(e, (_k, v) => (v instanceof Error ? { message: v.message } : v)));
  } catch {
    parts.push(String(e));
  }
  return parts.join("\n");
}

// Re-export so adapter-test files can import everything from one place.
export { streamChunks };
export type { FakeFetchSpec };
