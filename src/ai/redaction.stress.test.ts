// @vitest-environment node
import { describe, it, expect } from "vitest";
import { OllamaAdapter } from "./adapters/ollama";
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible";
import { AnthropicAdapter } from "./adapters/anthropic";
import { fakeFetch, streamChunks, InMemorySecretStore } from "./testing/fakeFetch";
import { ProviderError } from "./errors";
import type { Provider } from "./provider";

/**
 * SC-004 key-redaction stress test (Feature 016 / Constitution II / FR-016).
 *
 * Drives 100 simulated provider calls across all three adapters spanning every error kind, and
 * asserts: NEITHER the test secret NOR any `Authorization` / `x-api-key` value appears in:
 *   - any thrown error's `.message`, `.stack`, or `.cause` (recursively).
 *   - `JSON.stringify(thrown)`.
 *   - the adapter instance's stringified own properties.
 *   - the captured `console.log` / `console.warn` / `console.error` log lines (production
 *     adapters call none — but the assertion locks the absence so a future leaky log is caught).
 */

const TEST_KEY = "sk-DO-NOT-LEAK-EVER-1234567890abcdef";

interface CallSpec {
  adapterName: "ollama" | "openai-compat" | "anthropic";
  kind: "success" | "auth" | "rate_limit" | "timeout" | "offline" | "cancelled" | "bad_response" | "unknown";
}

function makeOllama(fetchFn: typeof fetch): Provider {
  return new OllamaAdapter({ id: "ollama-1", baseUrl: "http://localhost:11434", fetchFn });
}

function makeOpenAI(fetchFn: typeof fetch, secrets: InMemorySecretStore): Provider {
  return new OpenAICompatibleAdapter({
    id: "openai-1",
    baseUrl: "https://api.openai.com",
    apiKeyRef: "openai-1",
    secrets,
    fetchFn,
  });
}

function makeAnthropic(fetchFn: typeof fetch, secrets: InMemorySecretStore): Provider {
  return new AnthropicAdapter({ id: "anthropic-1", apiKeyRef: "anthropic-1", secrets, fetchFn });
}

function buildSseChunk(adapter: "openai-compat" | "anthropic"): ReturnType<typeof streamChunks> {
  if (adapter === "openai-compat") {
    return streamChunks([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
  }
  return streamChunks([
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n',
    'data: {"type":"message_stop"}\n\n',
  ]);
}

function buildOllamaSuccess(): ReturnType<typeof streamChunks> {
  return streamChunks([
    '{"model":"llama","message":{"role":"assistant","content":"hi"},"done":false}\n',
    '{"model":"llama","done":true}\n',
  ]);
}

async function consumeChat(it: AsyncIterable<{ delta: string; done: boolean }>): Promise<void> {
  for await (const _ of it) void _;
}

function runCall(spec: CallSpec, secrets: InMemorySecretStore): Promise<unknown> {
  const ctrl = spec.kind === "cancelled" ? new AbortController() : null;

  const fetchSpec = (() => {
    switch (spec.kind) {
      case "success":
        if (spec.adapterName === "ollama") return { response: { stream: buildOllamaSuccess() } };
        return { response: { stream: buildSseChunk(spec.adapterName) } };
      case "auth":
        return { response: { status: 401, body: { error: "bad key" } as Record<string, unknown> } };
      case "rate_limit":
        return { response: { status: 429, body: { error: "throttled" } as Record<string, unknown> } };
      case "timeout":
        return { response: { status: 408, body: { error: "timeout" } as Record<string, unknown> } };
      case "offline":
        return { reject: "TypeError" as const };
      case "cancelled":
        return { reject: "AbortError" as const };
      case "bad_response":
        if (spec.adapterName === "ollama")
          return {
            response: {
              stream: streamChunks(['{"valid":true}\n', "this is not json\n"]),
            },
          };
        if (spec.adapterName === "openai-compat")
          return {
            response: {
              stream: streamChunks([
                "data: this-is-not-json\n\n",
                "data: [DONE]\n\n",
              ]),
            },
          };
        return {
          response: {
            stream: streamChunks([
              "data: not-json-just-text\n\n",
              'data: {"type":"message_stop"}\n\n',
            ]),
          },
        };
      case "unknown":
        return { response: { status: 503, body: { error: "down" } as Record<string, unknown> } };
    }
  })();

  const fetchFn = fakeFetch(fetchSpec);
  const adapter =
    spec.adapterName === "ollama"
      ? makeOllama(fetchFn)
      : spec.adapterName === "openai-compat"
        ? makeOpenAI(fetchFn, secrets)
        : makeAnthropic(fetchFn, secrets);

  if (spec.kind === "cancelled" && ctrl) {
    ctrl.abort();
  }

  const promise =
    spec.kind === "success"
      ? consumeChat(
          adapter.chat([{ role: "user", content: "hi" }], {
            containsVaultContent: true,
            model: "m",
            signal: ctrl?.signal,
          }),
        )
      : consumeChat(
          adapter.chat([{ role: "user", content: "hi" }], {
            containsVaultContent: true,
            model: "m",
            signal: ctrl?.signal,
          }),
        );

  // Capture the adapter instance too — return both as a tuple via Promise.all.
  return promise
    .then(() => ({ adapter, error: null as unknown }))
    .catch((err) => ({ adapter, error: err }));
}

function serializeError(err: unknown): string {
  if (err === null || err === undefined) return String(err);
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.message);
    parts.push(err.stack ?? "");
    if (typeof (err as { cause?: unknown }).cause !== "undefined") {
      parts.push(serializeError((err as { cause?: unknown }).cause));
    }
  }
  try {
    parts.push(JSON.stringify(err, (_k, v) => (v instanceof Error ? { message: v.message } : v)));
  } catch {
    parts.push(String(err));
  }
  return parts.join("\n");
}

function stringifyInstance(adapter: Provider): string {
  const obj: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(adapter)) {
    try {
      obj[key] = (adapter as unknown as Record<string, unknown>)[key];
    } catch {
      obj[key] = "<unreadable>";
    }
  }
  try {
    return JSON.stringify(obj);
  } catch {
    return String(adapter);
  }
}

describe("SC-004 redaction stress: 100 calls × 3 adapters × 8 error kinds", () => {
  it("zero API key occurrences across all calls (errors, stringified instances, logs)", async () => {
    const secrets = new InMemorySecretStore();
    await secrets.set("openai-1", TEST_KEY);
    await secrets.set("anthropic-1", TEST_KEY);

    const adapterNames: CallSpec["adapterName"][] = ["ollama", "openai-compat", "anthropic"];
    const kinds: CallSpec["kind"][] = [
      "success",
      "auth",
      "rate_limit",
      "timeout",
      "offline",
      "cancelled",
      "bad_response",
      "unknown",
    ];

    const specs: CallSpec[] = [];
    while (specs.length < 100) {
      for (const a of adapterNames) {
        for (const k of kinds) {
          if (a === "ollama" && (k === "auth" /* ollama has no auth */)) continue;
          specs.push({ adapterName: a, kind: k });
          if (specs.length >= 100) break;
        }
        if (specs.length >= 100) break;
      }
    }

    // Capture logs.
    const capturedLogs: string[] = [];
    const realLog = console.log;
    const realWarn = console.warn;
    const realError = console.error;
    console.log = (...args: unknown[]) => capturedLogs.push(args.map(String).join(" "));
    console.warn = (...args: unknown[]) => capturedLogs.push(args.map(String).join(" "));
    console.error = (...args: unknown[]) => capturedLogs.push(args.map(String).join(" "));

    let serializedAll = "";
    try {
      for (const spec of specs) {
        const result = await runCall(spec, secrets);
        const r = result as { adapter: Provider; error: unknown };
        serializedAll += serializeError(r.error) + "\n";
        serializedAll += stringifyInstance(r.adapter) + "\n";
      }
    } finally {
      console.log = realLog;
      console.warn = realWarn;
      console.error = realError;
    }

    // No key in serialized errors / instances.
    expect(serializedAll).not.toContain(TEST_KEY);
    // No key in captured log output.
    expect(capturedLogs.join("\n")).not.toContain(TEST_KEY);
    // No `Authorization: Bearer …` substring leaks in either pool. (Lowercase + standard.)
    expect(serializedAll.toLowerCase()).not.toContain("authorization: bearer");
    expect(serializedAll.toLowerCase()).not.toContain("x-api-key:");
  }, 30_000);
});

void ProviderError;
