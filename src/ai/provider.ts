/**
 * Provider interface (Feature 016 / Constitution II / PRD §10). The vendor-agnostic abstraction every
 * AI feature consumes — via the router (`AIRouter`), never directly. The three shipped adapters
 * (Ollama / OpenAI-compatible / Anthropic) live behind this interface in `src/ai/adapters/*`, the
 * only directory where vendor SDKs or HTTP specifics may be imported (ESLint-confined).
 *
 * Spine file: small, abstraction-only, no React, no third-party imports. The full design contract
 * lives at [ai-provider-layer.md](../../ai-provider-layer.md) §3 and
 * [specs/016-ai-provider-layer/contracts/provider-interface.md](../../specs/016-ai-provider-layer/contracts/provider-interface.md).
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  /** Overrides the role's default model when set. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /** Cancellation. Adapters MUST translate `AbortError` → `ProviderError('cancelled', …)`. */
  signal?: AbortSignal;
  /**
   * REQUIRED. TRUE when the prompt embeds vault-derived content (RAG context, note text, ingested
   * source excerpts, session writeups, project body content). FALSE only for generic prompts with
   * no vault data. There is NO safe default — the type system forces every caller to make this
   * decision. The router uses this to enforce lockdown (Constitution II, FR-012, FR-014).
   */
  containsVaultContent: boolean;
}

export interface ChatChunk {
  /** Incremental text since the previous chunk. May be `''` on the terminal chunk. */
  delta: string;
  /** True on the terminal chunk; the async iterable closes after yielding it. */
  done: boolean;
}

export interface EmbedOptions {
  model?: string;
  signal?: AbortSignal;
  /** Same required flag as `ChatOptions.containsVaultContent`. RAG indexing embeds vault text — the
   *  lockdown gate runs identically on `embed` (FR-012). */
  containsVaultContent: boolean;
}

export interface EmbedResult {
  /** One vector per input; input order MUST be preserved. */
  vectors: number[][];
  model: string;
  /** Length of each vector. */
  dimensions: number;
}

export interface ProviderCapabilities {
  chat: boolean;
  embeddings: boolean;
  streaming: boolean;
  /** RESERVED for future use. MUST be `false` in v1 across all adapters. */
  tools: boolean;
  /** Best-effort; may be undefined for some endpoints. */
  contextWindow?: number;
  /**
   * Computed from the endpoint, NOT stored. The single flag the lockdown gate reads. Returns
   * `true` iff the host is `localhost` / `127.0.0.1` / `::1` — see `src/ai/classification.ts`.
   * LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x) MUST return `false` (FR-009).
   */
  isLocal: boolean;
}

/**
 * Result of a LIVE probe call. Extends the static capability shape with a measured round-trip
 * latency. Success implies reachability — adapters throw `ProviderError` on failure. This is the
 * shape "Test connection" surfaces in the Settings UI (FR-016 / FR-017).
 */
export interface ProbeOutcome extends ProviderCapabilities {
  /** Round-trip latency of the live probe, in milliseconds. */
  latencyMs: number;
}

export interface ProbeOptions {
  signal?: AbortSignal;
}

export type ProviderType = "ollama" | "openai-compatible" | "anthropic" | "deepseek" | "gemini" | "voyage";

export interface Provider {
  /** Matches the `ProviderConfig.id` that produced this Provider. */
  readonly id: string;
  readonly type: ProviderType;
  /**
   * Static (synchronous) capability shape. Used by the router's lockdown gate and embed re-route
   * decisions, where blocking on I/O is not acceptable. Derived from the endpoint + adapter type;
   * NEVER hits the network. For a live reachability check, use `probe()`.
   */
  capabilities(): ProviderCapabilities;
  /**
   * LIVE probe — makes one cheap HTTP call (or, for Anthropic, a 1-token POST) to verify the
   * provider is reachable, the API key is accepted (where applicable), and to measure latency.
   * On failure throws a `ProviderError` with the appropriate kind (`offline` / `auth` /
   * `unsupported` / `bad_response` / `cancelled`). Called from `AIRouter.probe(force:true)` and
   * the Settings "Test connection" button.
   */
  probe(opts?: ProbeOptions): Promise<ProbeOutcome>;
  /** Streaming chat. MUST honor `opts.signal` and yield exactly one terminal `done: true` chunk. */
  chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk>;
  embed(texts: string[], opts: EmbedOptions): Promise<EmbedResult>;
}
