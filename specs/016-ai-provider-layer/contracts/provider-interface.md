# Contract: Provider Interface

**File**: `src/ai/provider.ts` (spine — abstraction-only). Single source of truth for the cross-vendor `Provider` shape. Imported by adapters, the router, the composition root, and (in future) the AI consumers. The contract is normative: any change here is a Constitution II-touching change.

## TypeScript shape

```ts
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  model?: string;            // overrides the role's default model when set
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  signal?: AbortSignal;      // cancellation
  /**
   * REQUIRED. TRUE when the prompt embeds vault-derived content (RAG context,
   * note text, ingested source excerpts, session writeups, project body content).
   * FALSE only for generic prompts with no vault data. There is NO safe default —
   * the compiler must force every caller to make this decision.
   */
  containsVaultContent: boolean;
}

export interface ChatChunk {
  delta: string;             // incremental text since last chunk
  done: boolean;             // true on the terminal chunk
}

export interface EmbedOptions {
  model?: string;
  signal?: AbortSignal;
  containsVaultContent: boolean;   // SAME REQUIREMENT as ChatOptions — RAG indexes note text
}

export interface EmbedResult {
  vectors: number[][];       // one vector per input; input order preserved
  model: string;
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
   * Computed from the endpoint, not stored. THE flag the lockdown gate reads.
   * Returns `true` iff the host is `localhost`, `127.0.0.1`, or `::1`. LAN IPs
   * (192.168.x.x, 10.x.x.x, 172.16-31.x.x) MUST return `false` — see
   * `src/ai/classification.ts::isLocalHost`.
   */
  isLocal: boolean;
}

export type ProviderType = 'ollama' | 'openai-compatible' | 'anthropic';

export interface Provider {
  readonly id: string;       // matches the ProviderConfig.id that produced it
  readonly type: ProviderType;
  capabilities(): ProviderCapabilities;
  chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk>;
  embed(texts: string[], opts: EmbedOptions): Promise<EmbedResult>;
}
```

## Invariants

I1. **`containsVaultContent` is required, not optional.** The type system MUST refuse a call that omits it. The interface MUST NOT default it to `false` or `true`; the caller decides per call.

I2. **`isLocal` is a function of `baseUrl`, not stored state.** Two adapters with the same `baseUrl` MUST return the same `isLocal`. Tests assert this with the `isLocalHost` matrix (localhost / 127.0.0.1 / ::1 → true; LAN / public hosts → false).

I3. **`chat` is async-iterable.** A call returns immediately with an `AsyncIterable<ChatChunk>`. The iterator MUST yield at least one chunk for every successful call — the terminal `done: true` chunk. (A zero-token completion still yields one chunk with `delta: ''` and `done: true`.)

I4. **`embed` is request-response, not streaming** in v1. (`vectors.length === texts.length`; if a provider doesn't support this batch shape, the adapter MUST iterate internally and assemble the array.)

I5. **`AbortSignal` MUST be honored** by both `chat` and `embed`. Cancellation translates to `ProviderError('cancelled', …)` (see [errors.md](errors.md)).

I6. **`Provider.id` is the same string** as the `ProviderConfig.id` that produced it. The router uses this to thread errors back to the originating config.

I7. **Vendor specifics MUST NOT leak through this interface.** No Ollama-specific field on `ChatOptions`; no Anthropic-specific `system` parameter (Anthropic's system prompt is the first `{ role: 'system' }` message — the adapter translates). The interface MUST stay vendor-neutral; if a vendor needs a new option, the right place is `ChatOptions.model` or — if truly cross-cutting — extending the interface explicitly (a Constitution II amendment).

## Adapter responsibilities

Each of the three adapter files (`ollama.ts`, `openai-compatible.ts`, `anthropic.ts`) MUST:

1. Implement `Provider`.
2. Stream chat via the provider's native streaming protocol; yield each parsed chunk immediately (no full-response buffering).
3. Translate every native error condition to a `ProviderError` of the right kind (see [errors.md](errors.md)).
4. Honor `AbortSignal` on both `chat` and `embed`.
5. Compute `isLocal` from `baseUrl` (or, for Anthropic, hardcode `false`).
6. Fetch the API key from `SecretStore` at call time — never store it on the instance, never include it in `ProviderError.cause` or in any thrown error message.
7. NEVER log request bodies or response bodies when `opts.containsVaultContent === true` (this is the router's contract for production adapters; in unit tests, adapters MAY assert via a redaction helper).
8. Accept a constructor-time `fetch` parameter (defaulting to `globalThis.fetch`) for testability (R6 in research).

## What the interface does NOT specify

- The HTTP wire format. Adapters own it.
- The streaming protocol. Adapters own it.
- The authentication header convention. Adapters own it.
- The model identifier format. The `model` field is an opaque string the adapter passes along to its vendor.
- Token / cost counting. Reserved for a future amendment.

## Test surface

The shared adapter contract suite (`src/ai/testing/contract.ts`) parametrizes over the three adapter implementations and asserts:

- `chat` yields at least one chunk; final chunk has `done: true`.
- `chat` with `signal.abort()` mid-stream throws `ProviderError('cancelled', …)` (FR-022, SC-009).
- `embed(['a', 'b']).vectors.length === 2`; vectors preserve input order.
- `capabilities().isLocal` matches `isLocalHost(baseUrl)` for ollama and openai-compatible; is always `false` for anthropic.
- Auth-failure HTTP status maps to `ProviderError('auth', …, retryable:false)`.
- Network-error / `ECONNREFUSED` maps to `ProviderError('offline', …, retryable:true)`.
- HTTP 429 maps to `ProviderError('rate_limit', …, retryable:true)`.
- Timeout maps to `ProviderError('timeout', …, retryable:true)`.
- Vendor-format parse failure maps to `ProviderError('bad_response', …, retryable:false)`.
- The injected fake `fetch` confirms no `Authorization` / `x-api-key` header value (the actual secret) appears in any thrown error's stringification.
