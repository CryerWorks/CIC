/**
 * AnthropicAdapter (Feature 016 — Provider for Anthropic's Messages API). Streaming chat via SSE
 * over `POST https://api.anthropic.com/v1/messages` (endpoint hardcoded — no `baseUrl`). System
 * prompt is the top-level `system` body field, not a message — the adapter splits the
 * `ChatMessage[]` accordingly. Embeddings unsupported (returns retryable `unsupported` so the
 * router's embed re-route can fire). Auth via `x-api-key` + `anthropic-version` headers.
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
import { parseSseStream } from "./sse";
import type { SecretStore } from "../secrets";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicInit {
  id: string;
  apiKeyRef: string;
  secrets: SecretStore;
  defaultModel?: string;
  fetchFn?: typeof fetch;
}

export class AnthropicAdapter implements Provider {
  readonly id: string;
  readonly type = "anthropic" as const;
  private readonly apiKeyRef: string;
  private readonly secrets: SecretStore;
  private readonly defaultModel?: string;
  private readonly fetchFn: typeof fetch;

  constructor(init: AnthropicInit) {
    this.id = init.id;
    this.apiKeyRef = init.apiKeyRef;
    this.secrets = init.secrets;
    this.defaultModel = init.defaultModel;
    this.fetchFn = init.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  capabilities(): ProviderCapabilities {
    return {
      chat: true,
      embeddings: false,
      streaming: true,
      tools: false,
      isLocal: false,
    };
  }

  async probe(opts?: ProbeOptions): Promise<ProbeOutcome> {
    // Anthropic exposes no cheap GET that confirms reachability + auth. The pragmatic probe is
    // a minimal `POST /v1/messages` with `max_tokens:1` against the configured default model —
    // costs ~1 token (sub-cent) per click of "Test connection" and gives us a real, end-to-end
    // signal (network reachable, key valid, model id valid).
    const model = this.defaultModel;
    if (!model) {
      throw new ProviderError(
        "unsupported",
        this.id,
        "anthropic: set a default model before testing the connection",
        false,
      );
    }
    const body = {
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    };
    const start = performance.now();
    let res: Response;
    try {
      res = await this.fetchFn(ANTHROPIC_ENDPOINT, {
        method: "POST",
        headers: await this.buildHeaders(),
        body: JSON.stringify(body),
        signal: opts?.signal,
      });
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
        "anthropic: probe returned non-JSON",
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
    const model = opts.model ?? this.defaultModel ?? "";
    // Anthropic: split `system` messages out of the array; join their contents into the top-level
    // `system` field; the messages array contains user/assistant only.
    const systemParts: string[] = [];
    const conversation: ChatMessage[] = [];
    for (const m of messages) {
      if (m.role === "system") systemParts.push(m.content);
      else conversation.push(m);
    }
    const body: Record<string, unknown> = {
      model,
      messages: conversation,
      stream: true,
      max_tokens: opts.maxTokens ?? 1024,
      ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.stop ? { stop_sequences: opts.stop } : {}),
    };

    let res: Response;
    try {
      res = await this.fetchFn(ANTHROPIC_ENDPOINT, {
        method: "POST",
        headers: await this.buildHeaders(),
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      throw this.translateNetworkError(e);
    }
    if (!res.ok) throw this.translateHttpError(res);
    if (!res.body) throw new ProviderError("bad_response", this.id, "anthropic: empty response body", false);

    let sawTerminal = false;
    try {
      for await (const payload of parseSseStream(res.body)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          // Some SSE keep-alive lines or [DONE] marker; ignore non-JSON payloads.
          continue;
        }
        const event = parsed as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          yield { delta: event.delta.text ?? "", done: false };
        } else if (event.type === "message_stop") {
          yield { delta: "", done: true };
          sawTerminal = true;
          return;
        }
      }
    } catch (e) {
      if (isAbort(e)) throw new ProviderError("cancelled", this.id, "cancelled by caller", false);
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("bad_response", this.id, "anthropic: stream parse failed", false);
    }
    if (!sawTerminal) {
      yield { delta: "", done: true };
    }
  }

  async embed(_texts: string[], _opts: EmbedOptions): Promise<EmbedResult> { // eslint-disable-line @typescript-eslint/no-unused-vars
    // Anthropic does not currently offer embeddings. Retryable so the router's embed re-route
    // can fall through to the configured local embeddings provider.
    throw new ProviderError(
      "unsupported",
      this.id,
      "anthropic has no embeddings endpoint",
      true,
    );
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const key = await this.secrets.get(this.apiKeyRef);
    if (!key) {
      throw new ProviderError("auth", this.id, "anthropic: no API key configured for this provider", false);
    }
    return {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
    };
  }

  private translateNetworkError(e: unknown): ProviderError {
    if (e instanceof ProviderError) return e;
    if (isAbort(e)) return new ProviderError("cancelled", this.id, "cancelled by caller", false);
    return new ProviderError(
      "offline",
      this.id,
      `anthropic: couldn't reach api.anthropic.com (${detailOf(e)})`,
      true,
      e,
    );
  }

  private translateHttpError(res: Response): ProviderError {
    const kind = mapHttpStatus(res.status);
    return new ProviderError(
      kind,
      this.id,
      `anthropic: HTTP ${res.status} ${res.statusText}`,
      isRetryableKind(kind),
    );
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message));
}

/** Short, secret-free description of a thrown fetch/transport error — surfaced so a rejected
 *  HTTP-plugin scope or a connection refusal is diagnosable rather than an opaque "couldn't reach".
 *  Connection/scope errors never carry the x-api-key header, so this is safe to surface. */
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
