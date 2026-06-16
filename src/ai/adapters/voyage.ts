/**
 * VoyageAdapter (Feature 022: Voyage AI embeddings provider). Embed-only — chat throws
 * "unsupported" so the router re-routes chat to a different provider. Embed uses
 * POST /v1/embeddings with Bearer auth.
 */
import type {
  Provider,
  ChatMessage, ChatOptions, ChatChunk,
  EmbedOptions, EmbedResult,
  ProviderCapabilities, ProbeOptions, ProbeOutcome,
} from "../provider";
import { ProviderError } from "../errors";
import type { SecretStore } from "../secrets";

export class VoyageAdapter implements Provider {
  readonly id: string;
  readonly type = "voyage" as const;
  private readonly _apiKeyRef: string;
  private readonly _secrets: SecretStore;
  private readonly defaultModel: string;
  private readonly fetchFn: typeof fetch;
  private readonly inlineKey?: string;

  constructor(opts: {
    id: string;
    apiKeyRef: string;
    secrets: SecretStore;
    defaultModel?: string;
    fetchFn?: typeof fetch;
    apiKey?: string;
  }) {
    this.id = opts.id;
    this._apiKeyRef = opts.apiKeyRef;
    this._secrets = opts.secrets;
    this.defaultModel = opts.defaultModel ?? "voyage-3";
    this.fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.inlineKey = opts.apiKey;
  }

  private async resolveKey(): Promise<string | null> {
    if (this.inlineKey) return this.inlineKey;
    return this._secrets.get(this._apiKeyRef);
  }

  capabilities(): ProviderCapabilities {
    return { chat: false, embeddings: true, streaming: false, tools: false, isLocal: false };
  }

  async probe(opts?: ProbeOptions): Promise<ProbeOutcome> {
    const key = await this.resolveKey();
    const start = performance.now();
    const res = await this.fetchFn("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key ?? ""}` },
      body: JSON.stringify({ model: this.defaultModel, input: ["ping"] }),
      signal: opts?.signal,
    });
    if (!key) throw new ProviderError("auth", this.id, "No API key configured — add one in Settings → AI", false);
    if (!res.ok) {
      if (res.status === 401) throw new ProviderError("auth", this.id, "Invalid API key", false);
      throw new ProviderError("offline", this.id, "Voyage API unreachable", true);
    }
    return {
      chat: false, embeddings: true, streaming: false, tools: false,
      isLocal: false,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  // eslint-disable-next-line require-yield, @typescript-eslint/no-unused-vars
  async *chat(_messages: ChatMessage[], _opts: ChatOptions): AsyncIterable<ChatChunk> {
    throw new ProviderError("unsupported", this.id, "Voyage is embed-only", true);
  }

  async embed(texts: string[], opts: EmbedOptions): Promise<EmbedResult> {
    const key = await this.resolveKey();
    if (!key) throw new ProviderError("auth", this.id, "No API key configured", false);
    const res = await this.fetchFn("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: opts.model ?? this.defaultModel, input: texts }),
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
