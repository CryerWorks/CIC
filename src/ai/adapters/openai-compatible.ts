/**
 * OpenAICompatibleAdapter (Feature 016 — Provider for any OpenAI-compatible HTTP endpoint:
 * OpenRouter, OpenAI, LM Studio, llama.cpp's server, vLLM, Together, Groq, etc.). One adapter,
 * configurable `baseUrl`. SSE streaming chat over `POST /v1/chat/completions`; embeddings over
 * `POST /v1/embeddings` (batched). `Authorization: Bearer <key>` auth, secret fetched at call
 * time from `SecretStore`. Deep module, ESLint-confined.
 */

import type {
  Provider,
  ChatMessage,
  ChatOptions,
  ChatChunk,
  EmbedOptions,
  EmbedResult,
  ProviderCapabilities,
  ProbeOptions,
  ProbeOutcome,
} from "../provider";
import { ProviderError, type ProviderErrorKind } from "../errors";
import { isLocalHost } from "../classification";
import { parseSseStream } from "./sse";
import type { SecretStore } from "../secrets";

interface OpenAICompatibleInit {
  id: string;
  baseUrl: string;
  /** OPTIONAL. Omit for keyless local servers (LM Studio, llama.cpp `--server`, vLLM). When set,
   *  the adapter fetches the secret at call time and sends `Authorization: Bearer <key>`. */
  apiKeyRef?: string;
  secrets?: SecretStore;
  defaultModel?: string;
  embedModel?: string;
  fetchFn?: typeof fetch;
}

export class OpenAICompatibleAdapter implements Provider {
  readonly id: string;
  readonly type = "openai-compatible" as const;
  private readonly baseUrl: string;
  private readonly apiKeyRef?: string;
  private readonly secrets?: SecretStore;
  private readonly defaultModel?: string;
  private readonly embedModel?: string;
  private readonly fetchFn: typeof fetch;

  constructor(init: OpenAICompatibleInit) {
    this.id = init.id;
    this.baseUrl = init.baseUrl.replace(/\/+$/, "");
    this.apiKeyRef = init.apiKeyRef;
    this.secrets = init.secrets;
    this.defaultModel = init.defaultModel;
    this.embedModel = init.embedModel;
    this.fetchFn = init.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  capabilities(): ProviderCapabilities {
    return {
      chat: true,
      embeddings: true,
      streaming: true,
      tools: false,
      isLocal: isLocalHost(this.baseUrl),
    };
  }

  async probe(opts?: ProbeOptions): Promise<ProbeOutcome> {
    // OpenAI-compatible servers all expose GET /v1/models — the same call LM Studio, OpenAI,
    // OpenRouter, llama.cpp's server, vLLM, etc. answer to. Cheap, no body, exercises the auth
    // header path when a key is configured (keyless local servers just respond unauthenticated).
    const url = `${this.baseUrl}/v1/models`;
    const headers = await this.buildHeaders();
    delete headers["content-type"]; // GET has no body
    const start = performance.now();
    let res: Response;
    try {
      res = await this.fetchFn(url, { method: "GET", headers, signal: opts?.signal });
    } catch (e) {
      throw this.translateNetworkError(e);
    }
    if (!res.ok) throw this.translateHttpError(res);
    try {
      await res.json();
    } catch {
      throw new ProviderError(
        "bad_response",
        this.id,
        "openai-compatible: /v1/models returned non-JSON",
        false,
      );
    }
    const latencyMs = Math.round(performance.now() - start);
    return { ...this.capabilities(), latencyMs };
  }

  chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk> {
    return this.streamChat(messages, opts);
  }

  private async *streamChat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const model = opts.model ?? this.defaultModel ?? "";
    const body = {
      model,
      messages,
      stream: true,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.stop ? { stop: opts.stop } : {}),
    };

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "POST",
        headers: await this.buildHeaders(),
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      throw this.translateNetworkError(e);
    }
    if (!res.ok) throw this.translateHttpError(res);
    if (!res.body) throw new ProviderError("bad_response", this.id, "openai-compatible: empty response body", false);

    let sawTerminal = false;
    try {
      for await (const payload of parseSseStream(res.body)) {
        if (payload === "[DONE]") {
          yield { delta: "", done: true };
          sawTerminal = true;
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          throw new ProviderError("bad_response", this.id, "openai-compatible: malformed SSE JSON", false);
        }
        const choice = (parsed as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> }).choices?.[0];
        const delta = choice?.delta?.content ?? "";
        const finish = choice?.finish_reason;
        if (delta.length > 0 || finish !== null) {
          yield { delta, done: false };
        }
      }
    } catch (e) {
      if (isAbort(e)) throw new ProviderError("cancelled", this.id, "cancelled by caller", false);
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("bad_response", this.id, `openai-compatible: stream parse failed`, false);
    }
    if (!sawTerminal) {
      yield { delta: "", done: true };
    }
  }

  async embed(texts: string[], opts: EmbedOptions): Promise<EmbedResult> {
    const url = `${this.baseUrl}/v1/embeddings`;
    const model = opts.model ?? this.embedModel ?? this.defaultModel ?? "";
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "POST",
        headers: await this.buildHeaders(),
        body: JSON.stringify({ model, input: texts }),
        signal: opts.signal,
      });
    } catch (e) {
      throw this.translateNetworkError(e);
    }
    if (!res.ok) throw this.translateHttpError(res);
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new ProviderError("bad_response", this.id, "openai-compatible: malformed JSON in embeddings response", false);
    }
    const data = (parsed as { data?: Array<{ embedding?: number[]; index?: number }> }).data;
    if (!Array.isArray(data)) {
      throw new ProviderError("bad_response", this.id, "openai-compatible: missing data array", false);
    }
    const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const vectors = sorted.map((d) => d.embedding ?? []);
    if (vectors.length !== texts.length) {
      throw new ProviderError("bad_response", this.id, "openai-compatible: embedding count mismatch", false);
    }
    return { vectors, model, dimensions: vectors[0]?.length ?? 0 };
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    // No apiKeyRef / no secrets store → keyless local server (LM Studio, llama.cpp, vLLM). Send
    // no Authorization header — those servers accept any input and many simply ignore it. Remote
    // providers (OpenAI, OpenRouter, etc.) will respond 401 here, which the HTTP-error mapper
    // surfaces as ProviderError('auth'), so the user gets accurate feedback either way.
    if (this.apiKeyRef && this.secrets) {
      const key = await this.secrets.get(this.apiKeyRef);
      if (key) headers.authorization = `Bearer ${key}`;
    }
    return headers;
  }

  private translateNetworkError(e: unknown): ProviderError {
    if (e instanceof ProviderError) return e;
    if (isAbort(e)) return new ProviderError("cancelled", this.id, "cancelled by caller", false);
    return new ProviderError(
      "offline",
      this.id,
      `openai-compatible: couldn't reach ${this.baseUrl} (${detailOf(e)})`,
      true,
      e,
    );
  }

  private translateHttpError(res: Response): ProviderError {
    const kind = mapHttpStatus(res.status);
    return new ProviderError(
      kind,
      this.id,
      `openai-compatible: HTTP ${res.status} ${res.statusText}`,
      isRetryableKind(kind),
    );
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message));
}

/** Short, secret-free description of a thrown fetch/transport error — surfaced so a rejected
 *  HTTP-plugin scope ("url not allowed on the configured scope") or a connection refusal is
 *  diagnosable rather than an opaque "couldn't reach". Connection/scope errors never carry the
 *  Authorization header, so this is safe to surface. */
function detailOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function mapHttpStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 408) return "timeout";
  if (status === 404) return "unsupported";
  if (status >= 500) return "unknown";
  return "unknown";
}

function isRetryableKind(k: ProviderErrorKind): boolean {
  return k === "rate_limit" || k === "timeout" || k === "offline" || k === "unsupported";
}
