/**
 * DeepSeekAdapter (Feature 022: DeepSeek provider). DeepSeek uses an OpenAI-compatible API
 * at `https://api.deepseek.com`. Auth: `Authorization: Bearer <key>`. Streaming SSE chat,
 * batched embeddings. Reuses parseSseStream for consistency.
 */
import type {
  Provider,
  ChatMessage, ChatOptions, ChatChunk,
  EmbedOptions, EmbedResult,
  ProviderCapabilities, ProbeOptions, ProbeOutcome,
} from "../provider";
import { ProviderError } from "../errors";
import { parseSseStream } from "./sse";
import type { SecretStore } from "../secrets";

export class DeepSeekAdapter implements Provider {
  readonly id: string;
  readonly type = "deepseek" as const;
  private readonly baseUrl: string;
  private readonly apiKeyRef: string;
  private readonly secrets: SecretStore;
  private readonly defaultModel: string;
  private readonly embedModel: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: {
    id: string;
    apiKeyRef: string;
    secrets: SecretStore;
    defaultModel?: string;
    embedModel?: string;
    fetchFn?: typeof fetch;
  }) {
    this.id = opts.id;
    this.baseUrl = "https://api.deepseek.com/v1";
    this.apiKeyRef = opts.apiKeyRef;
    this.secrets = opts.secrets;
    this.defaultModel = opts.defaultModel ?? "deepseek-chat";
    this.embedModel = opts.embedModel ?? "deepseek-chat";
    this.fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  capabilities(): ProviderCapabilities {
    return { chat: true, embeddings: true, streaming: true, tools: false, isLocal: false };
  }

  async probe(opts?: ProbeOptions): Promise<ProbeOutcome> {
    const key = await this.secrets.get(this.apiKeyRef);
    const start = performance.now();
    const res = await this.fetchFn(`${this.baseUrl}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key ?? ""}` },
      signal: opts?.signal,
    });
    if (!key) throw new ProviderError("auth", this.id, "No API key configured — add one in Settings → AI", false);
    if (!res.ok) {
      if (res.status === 401) throw new ProviderError("auth", this.id, "Invalid API key", false);
      throw new ProviderError("offline", this.id, "DeepSeek API unreachable", true);
    }
    return {
      chat: true, embeddings: true, streaming: true, tools: false,
      isLocal: false,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  async *chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk> {
    const key = await this.secrets.get(this.apiKeyRef);
    if (!key) {
      throw new ProviderError("auth", this.id, "No API key configured", false);
    }
    const body = {
      model: opts.model ?? this.defaultModel,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.stop?.length ? { stop: opts.stop } : {}),
    };
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new ProviderError("cancelled", this.id, "Request cancelled", false);
      }
      throw new ProviderError("offline", this.id, "DeepSeek API unreachable", true);
    }
    if (response.status === 401) throw new ProviderError("auth", this.id, "Invalid API key", false);
    if (response.status === 429) throw new ProviderError("rate_limit", this.id, "Rate limited", true);
    if (!response.ok) throw new ProviderError("bad_response", this.id, `HTTP ${response.status}`, true);
    if (!response.body) throw new ProviderError("bad_response", this.id, "No response body", true);
    let sawTerminal = false;
    for await (const payload of parseSseStream(response.body)) {
      if (payload === "[DONE]") {
        yield { delta: "", done: true };
        sawTerminal = true;
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw new ProviderError("bad_response", this.id, "Malformed SSE JSON", false);
      }
      const choice = (parsed as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> }).choices?.[0];
      const delta = choice?.delta?.content ?? "";
      const finish = choice?.finish_reason;
      if (delta.length > 0 || finish !== null) {
        yield { delta, done: false };
      }
    }
    if (!sawTerminal) {
      yield { delta: "", done: true };
    }
  }

  async embed(texts: string[], opts: EmbedOptions): Promise<EmbedResult> {
    const key = await this.secrets.get(this.apiKeyRef);
    if (!key) throw new ProviderError("auth", this.id, "No API key configured", false);
    const res = await this.fetchFn(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: opts.model ?? this.embedModel, input: texts }),
      signal: opts.signal,
    });
    if (!res.ok) throw new ProviderError("bad_response", this.id, `HTTP ${res.status}`, true);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }>; model: string };
    return {
      vectors: data.data.map((d) => d.embedding),
      model: data.model,
      dimensions: data.data[0]?.embedding.length ?? 0,
    };
  }
}
