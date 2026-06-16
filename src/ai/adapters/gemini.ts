/**
 * GeminiAdapter (Feature 022: Google Gemini provider). Uses Google's Generative Language API
 * at `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`.
 * Auth: API key as `?key=<KEY>` query parameter. Returns SSE-like streaming chunks.
 * Embeddings: `POST /v1beta/models/{model}:batchEmbedContents`.
 */
import type {
  Provider,
  ChatMessage, ChatOptions, ChatChunk,
  EmbedOptions, EmbedResult,
  ProviderCapabilities, ProbeOptions, ProbeOutcome,
} from "../provider";
import { ProviderError } from "../errors";
import type { SecretStore } from "../secrets";

export class GeminiAdapter implements Provider {
  readonly id: string;
  readonly type = "gemini" as const;
  private readonly _apiKeyRef: string;
  private readonly _secrets: SecretStore;
  private readonly defaultModel: string;
  private readonly embedModel: string;
  private readonly fetchFn: typeof fetch;
  private readonly inlineKey?: string;
  private static readonly BASE = "https://generativelanguage.googleapis.com/v1beta";

  constructor(opts: {
    id: string;
    apiKeyRef: string;
    secrets: SecretStore;
    defaultModel?: string;
    embedModel?: string;
    fetchFn?: typeof fetch;
    apiKey?: string;
  }) {
    this.id = opts.id;
    this._apiKeyRef = opts.apiKeyRef;
    this._secrets = opts.secrets;
    this.defaultModel = opts.defaultModel ?? "gemini-2.0-flash";
    this.embedModel = opts.embedModel ?? "text-embedding-004";
    this.fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.inlineKey = opts.apiKey;
  }

  private async resolveKey(): Promise<string | null> {
    if (this.inlineKey) return this.inlineKey;
    return this._secrets.get(this._apiKeyRef);
  }

  capabilities(): ProviderCapabilities {
    return { chat: true, embeddings: true, streaming: true, tools: false, isLocal: false };
  }

  async probe(opts?: ProbeOptions): Promise<ProbeOutcome> {
    const key = await this.resolveKey();
    const start = performance.now();
    const res = await this.fetchFn(
      `${GeminiAdapter.BASE}/models/${this.defaultModel}?key=${key ?? ""}`,
      { signal: opts?.signal },
    );
    if (!key) throw new ProviderError("auth", this.id, "No API key configured — add one in Settings → AI", false);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new ProviderError("auth", this.id, "Invalid API key", false);
      throw new ProviderError("offline", this.id, "Gemini API unreachable", true);
    }
    return {
      chat: true, embeddings: true, streaming: true, tools: false,
      isLocal: false,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  async *chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk> {
    const key = await this.resolveKey();
    if (!key) throw new ProviderError("auth", this.id, "No API key configured", false);

    // Convert ChatMessage[] to Gemini's contents format
    const contents = messages.map((m) => ({
      role: m.role === "system" ? "user" : m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // System message goes in systemInstruction
    const systemMsg = messages.filter((m) => m.role === "system");
    const systemInstruction = systemMsg.length > 0
      ? { parts: [{ text: systemMsg.map((m) => m.content).join("\n\n") }] }
      : undefined;

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) (body as Record<string, unknown>).systemInstruction = systemInstruction;
    if (opts.temperature != null) (body as Record<string, unknown>).generationConfig = { temperature: opts.temperature };
    if (opts.maxTokens != null) {
      (body as Record<string, unknown>).generationConfig = {
        ...((body as Record<string, unknown>).generationConfig as Record<string, unknown> ?? {}),
        maxOutputTokens: opts.maxTokens,
      };
    }

    const url = `${GeminiAdapter.BASE}/models/${opts.model ?? this.defaultModel}:streamGenerateContent?alt=sse&key=${key}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new ProviderError("cancelled", this.id, "Request cancelled", false);
      }
      throw new ProviderError("offline", this.id, "Gemini API unreachable", true);
    }
    if (response.status === 401 || response.status === 403) throw new ProviderError("auth", this.id, "Invalid API key", false);
    if (response.status === 429) throw new ProviderError("rate_limit", this.id, "Rate limited", true);
    if (!response.ok) throw new ProviderError("bad_response", this.id, `HTTP ${response.status}`, true);
    if (!response.body) throw new ProviderError("bad_response", this.id, "No response body", true);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const json = trimmed.slice(5).trim();
          if (json === "[DONE]") { yield { delta: "", done: true }; return; }
          try {
            const parsed = JSON.parse(json);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield { delta: text, done: false };
          } catch { /* skip malformed */ }
        }
      }
    } finally { reader.releaseLock(); }
    yield { delta: "", done: true };
  }

  async embed(texts: string[], opts: EmbedOptions): Promise<EmbedResult> {
    const key = await this.resolveKey();
    if (!key) throw new ProviderError("auth", this.id, "No API key configured", false);
    const url = `${GeminiAdapter.BASE}/models/${opts.model ?? this.embedModel}:batchEmbedContents?key=${key}`;
    const body = { requests: texts.map((t) => ({ model: `models/${opts.model ?? this.embedModel}`, content: { parts: [{ text: t }] } })) };
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) throw new ProviderError("bad_response", this.id, `HTTP ${res.status}`, true);
    const data = (await res.json()) as { embeddings: Array<{ values: number[] }> };
    return {
      vectors: data.embeddings.map((e) => e.values),
      model: opts.model ?? this.embedModel,
      dimensions: data.embeddings[0]?.values.length ?? 0,
    };
  }
}
