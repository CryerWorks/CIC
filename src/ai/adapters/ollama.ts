/**
 * OllamaAdapter (Feature 016 — Provider for a local Ollama runtime). Streaming chat via NDJSON
 * over `POST /api/chat`; embeddings via `POST /api/embeddings` (single-input — the adapter iterates
 * in order). No auth. `isLocal` from `baseUrl`. Deep module, ESLint-confined.
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
import { parseNdjsonStream } from "./ndjson";

interface OllamaInit {
  id: string;
  baseUrl: string;
  defaultModel?: string;
  embedModel?: string;
  fetchFn?: typeof fetch;
}

export class OllamaAdapter implements Provider {
  readonly id: string;
  readonly type = "ollama" as const;
  private readonly baseUrl: string;
  private readonly defaultModel?: string;
  private readonly embedModel?: string;
  private readonly fetchFn: typeof fetch;

  constructor(init: OllamaInit) {
    this.id = init.id;
    this.baseUrl = init.baseUrl.replace(/\/+$/, "");
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
    // Ollama's natural readiness check: GET /api/tags lists the loaded models. Cheap, no auth,
    // confirms reachability + the server speaks Ollama's protocol.
    const url = `${this.baseUrl}/api/tags`;
    const start = performance.now();
    let res: Response;
    try {
      res = await this.fetchFn(url, { method: "GET", signal: opts?.signal });
    } catch (e) {
      throw this.translateNetworkError(e);
    }
    if (!res.ok) throw this.translateHttpError(res);
    // Drain the body (best-effort; we don't care about the content, only that the server responded).
    try {
      await res.json();
    } catch {
      throw new ProviderError("bad_response", this.id, "ollama: /api/tags returned non-JSON", false);
    }
    const latencyMs = Math.round(performance.now() - start);
    return { ...this.capabilities(), latencyMs };
  }

  chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk> {
    const url = `${this.baseUrl}/api/chat`;
    const model = opts.model ?? this.defaultModel ?? "";
    const body = {
      model,
      messages,
      stream: true,
      options: {
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.stop ? { stop: opts.stop } : {}),
        ...(opts.maxTokens !== undefined ? { num_predict: opts.maxTokens } : {}),
      },
    };
    return this.streamChat(url, body, opts.signal);
  }

  private async *streamChat(
    url: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): AsyncIterable<ChatChunk> {
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      throw this.translateNetworkError(e);
    }
    if (!res.ok) throw this.translateHttpError(res);
    if (!res.body) throw new ProviderError("bad_response", this.id, "ollama: empty response body", false);

    let saw = false;
    try {
      for await (const raw of parseNdjsonStream(res.body)) {
        const obj = raw as { message?: { content?: string }; done?: boolean };
        const delta = obj.message?.content ?? "";
        const done = obj.done === true;
        yield { delta, done };
        saw = true;
        if (done) return;
      }
    } catch (e) {
      if (isAbort(e)) throw new ProviderError("cancelled", this.id, "cancelled by caller", false);
      if (e instanceof SyntaxError) {
        throw new ProviderError("bad_response", this.id, "ollama: malformed NDJSON", false);
      }
      throw e;
    }
    if (!saw) {
      // Stream ended without yielding anything — emit a terminal chunk anyway (A4).
      yield { delta: "", done: true };
    }
  }

  async embed(texts: string[], opts: EmbedOptions): Promise<EmbedResult> {
    const url = `${this.baseUrl}/api/embeddings`;
    const model = opts.model ?? this.embedModel ?? this.defaultModel ?? "";
    const vectors: number[][] = [];
    for (const prompt of texts) {
      let res: Response;
      try {
        res = await this.fetchFn(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, prompt }),
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
        throw new ProviderError("bad_response", this.id, "ollama: malformed JSON in embeddings response", false);
      }
      const embedding = (parsed as { embedding?: number[] }).embedding;
      if (!Array.isArray(embedding)) {
        throw new ProviderError("bad_response", this.id, "ollama: missing embedding array", false);
      }
      vectors.push(embedding);
    }
    return { vectors, model, dimensions: vectors[0]?.length ?? 0 };
  }

  private translateNetworkError(e: unknown): ProviderError {
    if (isAbort(e)) return new ProviderError("cancelled", this.id, "cancelled by caller", false);
    return new ProviderError(
      "offline",
      this.id,
      `couldn't reach Ollama at ${this.baseUrl} — is it running? (${detailOf(e)})`,
      true,
      e,
    );
  }

  private translateHttpError(res: Response): ProviderError {
    const kind = mapHttpStatus(res.status);
    return new ProviderError(
      kind,
      this.id,
      `ollama: HTTP ${res.status} ${res.statusText}`,
      isRetryableKind(kind),
    );
  }
}

function isAbort(e: unknown): boolean {
  return (
    e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message))
  );
}

/** Short, secret-free description of a thrown fetch/transport error — surfaced in the user-facing
 *  message so failures like a rejected HTTP-plugin scope ("url not allowed on the configured
 *  scope") or a connection refusal are diagnosable instead of an opaque "couldn't reach". */
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
