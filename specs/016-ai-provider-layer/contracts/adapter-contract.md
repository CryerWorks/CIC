# Contract: Adapter Contract (shared) + Test Harness

**Files**:
- `src/ai/adapters/{ollama,openai-compatible,anthropic}.ts` (deep, the three Provider implementations).
- `src/ai/adapters/{sse,ndjson}.ts` (deep, private streaming parsers).
- `src/ai/adapters/index.ts` (deep barrel: `createProvider(config, secrets) → Provider`).
- `src/ai/testing/contract.ts` (test harness — parametrized describe-block).
- `src/ai/testing/fakeFetch.ts` (test helper — builds a fake `fetch` returning controllable Response streams).

This contract is the **shared invariant set** every adapter MUST satisfy. The harness asserts each invariant against each adapter, so a regression in any one of them surfaces immediately.

## Adapter-shared invariants

A1. **Implements `Provider`** (see [provider-interface.md](provider-interface.md)).

A2. **Constructor signature**:
```ts
new OllamaAdapter({ id, baseUrl, secrets, fetch?, defaultModel?, embedModel? })
new OpenAICompatibleAdapter({ id, baseUrl, apiKeyRef, secrets, fetch?, defaultModel?, embedModel? })
new AnthropicAdapter({ id, apiKeyRef, secrets, fetch?, defaultModel? })  // no baseUrl; hardcoded inside
```

`fetch?` defaults to `globalThis.fetch`. Tests inject a `fakeFetch`. `secrets` is the `SecretStore` instance.

A3. **`chat` streams immediately.** The adapter MUST yield each `ChatChunk` as soon as the underlying stream emits a parseable chunk — no full-response buffering. The harness verifies by timestamping the yields and asserting they correlate with the stream's pull boundaries.

A4. **`chat` yields exactly one terminal chunk** with `done: true`. A zero-token completion still yields `{ delta: '', done: true }`.

A5. **`embed` preserves input order.** `embed([a, b, c])` returns `vectors` such that `vectors[0]` corresponds to `a`. If the vendor's API doesn't natively batch, the adapter iterates internally and assembles in order.

A6. **`AbortSignal` translation**. A signal aborted before or during a `chat` / `embed` call throws `ProviderError('cancelled', this.id, …, false)` — never a raw `DOMException`/`AbortError`.

A7. **Error mapping** per the [errors.md](errors.md) table. The harness drives each mapping with a synthesized fake `fetch` response.

A8. **`isLocal` derivation**. `capabilities().isLocal === isLocalHost(this.baseUrl)` for Ollama and OpenAI-compatible; `=== false` for Anthropic.

A9. **Secret fetch at call time, not at construction.** The adapter calls `await secrets.get(this.apiKeyRef)` inside `chat`/`embed`, not in the constructor. Reasons: (a) rotated keys work without reconstructing the adapter; (b) a deleted key surfaces as auth failure on the next call rather than at construction.

A10. **Secret NEVER on the instance.** The adapter does NOT cache the key in a private field. It fetches per call.

A11. **Secret NEVER in errors.** Even on auth/network/timeout/bad_response, no `ProviderError.message`, `.cause`, or stringification contains the API key or any header value beginning with `Bearer ` / `sk-` / `x-api-key:`. The harness asserts via grep on the captured throw.

A12. **No console / log output by default.** Adapters do NOT call `console.log`/`.warn`/`.error` in production paths. (Tests MAY drive a `debug` callback later; not in v1.)

A13. **Partial-chunk safe**. The harness slices a known SSE / NDJSON payload at 1-byte, 7-byte, and 100-byte boundaries and asserts identical output for each slicing. This catches "we forgot the buffer carryover" bugs.

A14. **Constitution II / Pocock**. The adapter file is the ONLY file in the codebase importing its vendor's specifics. (`openai`/`@anthropic-ai/sdk` are dormant via ESLint; in practice every adapter uses plain `fetch`, so the import surface is narrow.)

A15. **`createProvider(config, secrets) → Provider`** in `adapters/index.ts` is the only public export the composition root imports. The three adapter classes are NOT exported beyond the directory (enforced by ESLint via `no-restricted-imports` already wired for SDKs, and by the barrel-only export pattern for the adapters themselves — code review enforces this).

## Per-adapter specifics

### `OllamaAdapter`

- **Chat endpoint**: `POST {baseUrl}/api/chat`.
- **Chat stream format**: NDJSON. Each line is a JSON object `{ model, message: { role, content }, done }`. The terminal line has `done: true` and a summary block (we ignore the summary fields beyond `done`).
- **Embed endpoint**: `POST {baseUrl}/api/embeddings`. Request `{ model, prompt }` per input (the API is single-input; the adapter iterates).
- **Auth**: none.
- **Capability probe**: `GET {baseUrl}/api/tags` → present-and-200 means chat ✓; embeddings ✓ is model-dependent (the probe assumes yes; the user picks the model).
- **isLocal**: `isLocalHost(baseUrl)`.

### `OpenAICompatibleAdapter`

- **Chat endpoint**: `POST {baseUrl}/v1/chat/completions` with `stream: true`.
- **Chat stream format**: SSE. Each `data: …` line is a JSON object `{ choices: [{ delta: { content }, finish_reason }] }`. A `data: [DONE]` line terminates.
- **Embed endpoint**: `POST {baseUrl}/v1/embeddings` with `input: texts`.
- **Auth**: `Authorization: Bearer <key>` header.
- **Capability probe**: `GET {baseUrl}/v1/models` (where supported); some implementations don't expose this — the harness allows either a 200 with model list OR a 404 (interpreted as "models endpoint not present; capabilities are best-effort").
- **isLocal**: `isLocalHost(baseUrl)`.

### `AnthropicAdapter`

- **Chat endpoint**: `POST https://api.anthropic.com/v1/messages` (hardcoded; no `baseUrl`).
- **Chat stream format**: SSE. Anthropic's stream emits a sequence of events; the parser extracts `content_block_delta` events' `delta.text` field.
- **System prompt**: Anthropic puts `system` as a top-level body field, not as a message. The adapter splits `messages: ChatMessage[]` into `system: string | undefined` (joined from any `role: 'system'` messages) + `messages` containing the rest.
- **Embed endpoint**: NONE. Anthropic does not currently offer embeddings. `capabilities().embeddings === false`. Calling `.embed()` on this adapter throws `ProviderError('unsupported', this.id, 'anthropic has no embeddings endpoint', true)` — retryable so the router's embed re-route fires.
- **Auth**: `x-api-key: <key>` + `anthropic-version: 2023-06-01` headers.
- **Capability probe**: a minimal `POST /v1/messages` with a one-token prompt (`max_tokens: 1`) — Anthropic doesn't expose a cheaper probe.
- **isLocal**: hardcoded `false`.

## The fake `fetch` harness (`src/ai/testing/fakeFetch.ts`)

A simple helper builder:

```ts
export interface FakeFetchSpec {
  expectMethod?: 'GET' | 'POST';
  expectUrl?: string | RegExp;
  expectHeaders?: Record<string, string | RegExp>;
  expectBody?: (body: unknown) => void | Promise<void>;
  /** Either a complete response, or a streamed body builder. */
  response:
    | { status: number; body?: string | object; headers?: Record<string, string> }
    | { stream: AsyncIterable<Uint8Array>; status?: number; headers?: Record<string, string> };
  /** If set, fetch rejects with this (simulates network error / abort). */
  reject?: 'AbortError' | 'TypeError' /* network */ | Error;
  /** Delay before first byte; default 0. */
  delayMs?: number;
}

/** Returns a fetch-shaped function honoring the spec. */
export function fakeFetch(spec: FakeFetchSpec | FakeFetchSpec[]): typeof fetch;

/** Returns a stream that yields the given chunks with optional delays between them. */
export function streamChunks(chunks: (Uint8Array | string)[], gapMs?: number): AsyncIterable<Uint8Array>;

/** Slices a string into chunks of size `n` for partial-chunk testing. */
export function sliceBytes(s: string, n: number): Uint8Array[];
```

A fake response uses `new Response(new ReadableStream({ ... }), { status, headers })`. The harness's `streamChunks` builds the `ReadableStream` from any async iterable of chunks.

`fakeFetch` automatically wires `AbortSignal` into the stream's `cancel` callback so the adapter sees the abort end-to-end (this is what `globalThis.fetch` does natively).

## The contract suite (`src/ai/testing/contract.ts`)

```ts
import type { Provider } from '../provider';

export interface ContractCase {
  name: string;                                  // e.g. 'OllamaAdapter'
  makeAdapter: (fetchFn: typeof fetch, baseUrl: string, secrets: SecretStore) => Provider;
  vendor: {
    chatChunkOk: () => AsyncIterable<Uint8Array>;        // builds a valid streaming chat response
    chatTerminalOnly: () => AsyncIterable<Uint8Array>;   // zero-token completion
    embedOk: (n: number) => string;                       // valid embeddings response body
    authErrorResponse: () => { status: number; body?: string };
    rateLimitResponse: () => { status: number; body?: string; headers?: Record<string, string> };
    badResponseResponse: () => { status: number; body?: string };
  };
  isLocalExpected: (baseUrl: string) => boolean;
}

export function runAdapterContract(cases: ContractCase[]): void;
```

The function generates one `describe` per case, then asserts every invariant A1..A14 inside.

## Test surface summary

For each adapter:
- ✅ streams immediately (timestamps within tolerance).
- ✅ terminal chunk has `done: true`.
- ✅ `embed` preserves input order over `[a, b, c]`.
- ✅ `AbortSignal.abort()` mid-stream → `ProviderError('cancelled', …)` and no orphaned promise.
- ✅ `401` → `auth, retryable:false`; `429` → `rate_limit, retryable:true`; timeout → `timeout, retryable:true`; `ECONNREFUSED` → `offline, retryable:true`; malformed body → `bad_response, retryable:false`.
- ✅ secret never on instance (`Object.values(adapter)` doesn't contain it).
- ✅ secret never in error stringification.
- ✅ partial-chunk slicing at 1/7/100 bytes produces identical output.
- ✅ `isLocal` matches expectation per `baseUrl` matrix.

## Acceptance gate

Every adapter MUST pass every case in the harness before its task is marked complete. The plan-level quality gate (`/speckit-implement` step 8) blocks on this — same discipline as 010's FSRS engine test gates and 005's vault round-trip test gates.
