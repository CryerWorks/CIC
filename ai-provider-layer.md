# Design Doc — AI Provider Layer

> Component design for the vendor-agnostic AI layer. Implements PRD §10 and satisfies CLAUDE.md guardrails **#3 (vendor-agnostic, no SDK leakage)** and **#8 (local-only lockdown chokepoint)**. Everything AI-related in the app goes through this layer.

---

## 1. Purpose & scope
A single abstraction so every AI capability (Feynman tutor, retrieval quizzes, card drafting, course generation, RAG embeddings) is **backend-independent**. The user plugs in any backend — local (Ollama, LM Studio, llama.cpp, vLLM), OpenRouter, or any frontier vendor — and routes different *roles* to different providers. Features never know which vendor answered.

**In scope:** the `Provider` interface, the three shipped adapters, role-based routing, the config + secrets model, fallback/capability handling, and the lockdown chokepoint.
**Out of scope (other docs):** RAG chunking strategy, prompt template contents, the SRS engine.

## 2. Design principles
1. **No SDK leakage.** Vendor SDKs/HTTP specifics live *only* in `src/ai/adapters/*`. The rest of the app imports `provider.ts` / `router.ts` types only.
2. **Role, not vendor.** Features ask for `'reasoning'` / `'drafting'` / `'embeddings'`, never for "Claude" or "gpt-4o".
3. **One chokepoint.** All calls flow through `AIRouter`. Lockdown, fallback, and routing are enforced there and nowhere else.
4. **Local is first-class, remote is opt-in.** With a local provider configured, the app works fully offline. Remote providers are allowed only when the user configured them and lockdown permits.
5. **Secrets never touch disk in the clear**, never log, never enter config objects, never enter the vault.

---

## 3. Core types (`src/ai/provider.ts`)

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
  signal?: AbortSignal;      // cancellation (user stops a stream)
  /**
   * Set TRUE when the prompt embeds vault-derived content (RAG context,
   * note text, ingested source excerpts, session writeups). Set FALSE
   * only for generic prompts with no vault data (rephrasing user input,
   * pure-template system prompts). **REQUIRED** — the type system forces
   * every caller to make this decision explicitly; there is no safe
   * default. The router uses this to enforce lockdown (§7).
   */
  containsVaultContent: boolean;
}

export interface ChatChunk {
  delta: string;             // incremental text since last chunk
  done: boolean;             // true on the terminal chunk
}

export interface EmbedResult {
  vectors: number[][];       // one per input, input order preserved
  model: string;
  dimensions: number;
}

export interface ProviderCapabilities {
  chat: boolean;
  embeddings: boolean;
  streaming: boolean;
  tools: boolean;
  contextWindow?: number;
  /** Derived from the endpoint. THE flag the lockdown gate checks. */
  isLocal: boolean;
}

export interface Provider {
  readonly id: string;       // matches ProviderConfig.id
  readonly type: ProviderType;
  capabilities(): ProviderCapabilities;
  /** Streaming chat. MUST honor opts.signal and yield a final done:true chunk. */
  chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk>;
  embed(
    texts: string[],
    opts: { model?: string; signal?: AbortSignal; containsVaultContent: boolean },
  ): Promise<EmbedResult>;
}

export type ProviderType = 'ollama' | 'openai-compatible' | 'anthropic';
```

### Error taxonomy (`src/ai/errors.ts`)
```ts
export type ProviderErrorKind =
  | 'auth'          // missing/invalid key → surface, prompt re-auth (not retryable)
  | 'rate_limit'    // retryable (backoff / fallback)
  | 'timeout'       // retryable
  | 'offline'       // network unreachable → retryable via local fallback
  | 'unsupported'   // capability absent → route elsewhere
  | 'bad_response'  // parse failure
  | 'cancelled'     // user aborted (not retryable, not an error to surface loudly)
  | 'unknown';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly providerId: string,
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) { super(message); this.name = 'ProviderError'; }
}
```

---

## 4. Configuration (`src/ai/config.ts`)
Stored **locally** (app config dir), never in the vault, never synced. Validate with **zod** on load — never trust the shape.

```ts
export type AIRole = 'reasoning' | 'drafting' | 'embeddings';

export interface ProviderConfig {
  id: string;                // unique, stable
  type: ProviderType;
  label: string;             // user-facing name
  baseUrl?: string;          // ollama: default http://localhost:11434
                             // openai-compatible: REQUIRED (LM Studio, llama.cpp,
                             //   OpenRouter, OpenAI, vLLM, …)
  apiKeyRef?: string;        // KEYCHAIN reference id — NEVER the key itself
  defaultModel?: string;
  embedModel?: string;
}

export interface RoleTarget {
  providerId: string;
  model: string;
  fallback?: RoleTarget;     // linked list = fallback chain
}

export interface AIConfig {
  providers: ProviderConfig[];
  routing: Record<AIRole, RoleTarget>;
  /** Local-only lockdown: refuse to send vault content to non-local providers. */
  lockdown: boolean;
}
```

> **`isLocal` is computed, not stored.** A provider is local iff its resolved `baseUrl` host is `localhost` / `127.0.0.1` / `::1` (Ollama defaults to local; an OpenAI-compatible entry pointing at LM Studio or llama.cpp is local, one pointing at OpenRouter is not). This single rule lets the **same** OpenAI-compatible adapter be local or remote, and makes lockdown "just work."
>
> **UX implication — LAN ≠ local.** A user running Ollama on a LAN box (`192.168.1.x`, `10.x.x.x`, `172.16-31.x.x`) is treated as **remote** — lockdown will block vault content even though the box never leaves the home network. This is deliberate (we cannot verify a LAN endpoint's egress posture), but it surprises users. The settings UI MUST surface this explicitly — show "remote (LAN)" with a tooltip explaining lockdown will fire, rather than just "remote".

---

## 5. Secrets (`src/ai/secrets.ts`)
```ts
export interface SecretStore {
  set(ref: string, secret: string): Promise<void>;
  get(ref: string): Promise<string | null>;
  delete(ref: string): Promise<void>;
}
```
- Tauri implementation backs onto the OS keyring (keychain / Credential Manager / libsecret).
- Config stores only `apiKeyRef`; the actual key is fetched **inside the adapter at call time** and never placed in a config object, log line, or error message.
- Redact any header containing a key before logging. Lint/grep CI check: no `apiKey` value in logs.
- **Never log request or response bodies when `opts.containsVaultContent` is true** — even on error paths (`bad_response`, `timeout`, `unknown`). Vault content blocked by the lockdown gate can still leak via error/debug logs if the body is captured. In that path, logs record only: provider id, error kind, prompt token count, and a redacted placeholder (`<vault-content-redacted>`). The router enforces this before delegating to adapters; adapters do not log bodies.

---

## 6. Adapters (`src/ai/adapters/*`) — the ONLY place vendor specifics live

All three implement `Provider`. Shared rules: stream via the provider's native protocol, translate native errors into `ProviderError`, honor `AbortSignal`, compute `isLocal` from `baseUrl`.

### `ollama.ts`
- Endpoints: `POST /api/chat` (NDJSON stream), `POST /api/embeddings`.
- Auth: none. `baseUrl` default `http://localhost:11434` → `isLocal: true`.
- Capabilities: chat ✓, embeddings ✓ (model-dependent), streaming ✓.

### `openai-compatible.ts` — the keystone
- Endpoints: `POST {baseUrl}/v1/chat/completions` (SSE stream), `POST {baseUrl}/v1/embeddings`.
- Auth: `Authorization: Bearer <key>`.
- Covers **OpenRouter, OpenAI, LM Studio, llama.cpp `--server`, vLLM, Together, Groq**, etc. — one adapter, configurable `baseUrl`.
- `isLocal` derived from `baseUrl` host (LM Studio/llama.cpp → local; OpenRouter/OpenAI → remote).

### `anthropic.ts`
- Endpoint: `POST https://api.anthropic.com/v1/messages` (SSE stream).
- Auth: `x-api-key: <key>` + required `anthropic-version` header.
- Note the system prompt is a top-level field, not a message — translate `ChatMessage[]` accordingly. `isLocal: false`.

> Adding a vendor = one new file implementing `Provider`. Nothing else changes.

---

## 7. The Router (`src/ai/router.ts`) — routing + fallback + lockdown chokepoint

Every feature calls the router. It is the single place that resolves roles, enforces lockdown, and walks fallback chains.

```ts
export interface AIRouter {
  chat(role: AIRole, messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk>;
  embed(
    role: AIRole,
    texts: string[],
    opts: { signal?: AbortSignal; containsVaultContent: boolean },
  ): Promise<EmbedResult>;
  /**
   * Capability probe for a configured provider. Returns the cached result
   * by default — settings UIs can render without pinging on every mount.
   * Pass `force: true` to refresh; used by the "Test connection" button
   * and on first config save.
   */
  probe(providerId: string, opts?: { force?: boolean }): Promise<ProviderCapabilities>;
}
```

### Resolution & dispatch (per call)
1. Resolve `role → RoleTarget` from `AIConfig.routing`; instantiate the `Provider` for `providerId`.
2. **Lockdown gate (chokepoint):** if `opts.containsVaultContent && config.lockdown && !provider.capabilities().isLocal` → throw `ProviderError('unsupported', …, retryable:false)` with a clear "blocked by local-only mode" message. **No vault content leaves the machine here.** The same gate applies identically to both `chat` and `embed` — RAG indexing (the typical `embed` caller) sends vault note text, so the gate must run there too.
3. **Capability check:** for `embed`, if the target provider lacks embeddings, transparently route to the configured **local** embeddings provider (privacy-preserving default) rather than failing. This re-routing happens *after* the lockdown gate has already accepted the call.
4. Dispatch. On a **retryable** `ProviderError` (`rate_limit` / `timeout` / `offline` / `unsupported`), walk to `RoleTarget.fallback`; repeat. On a non-retryable error (`auth`, `cancelled`), surface immediately.
5. On `auth`, emit an app event so the UI can prompt re-authentication for that provider (re-enter key) — do not silently fall back past an auth failure unless a fallback target is explicitly configured.

### Fallback chains enable the key privacy mix
e.g. `reasoning` → remote frontier model with `fallback` → local Ollama. If offline, the app degrades to local automatically. Embeddings can be pinned local always, so **RAG never leaves the machine even when reasoning is remote**.

---

## 8. How features use it (the boundary contract)
A feature builds messages from a prompt template and calls the router by role. It never imports an adapter, a vendor SDK, or a model name.

```ts
// Feynman tutor (F4) — RAG context is vault-derived, so flag it.
const messages = buildSocraticPrompt({ concept, retrievedContext });
const stream = router.chat('reasoning', messages, {
  containsVaultContent: true,   // ← triggers lockdown gate if remote + locked
  signal,
});
for await (const { delta, done } of stream) {
  renderToken(delta);
  if (done) break;
}
```
```ts
// RAG indexer — embeddings role, pinned local in typical config.
// Note text IS vault content, so the flag is required and true.
const { vectors } = await router.embed('embeddings', chunks, {
  containsVaultContent: true,
});
```

Rule of thumb for `containsVaultContent`: set it `true` whenever the payload includes note text, RAG retrieval, ingested-source excerpts, or session writeups. Set it `false` for generic prompts with no vault data (e.g. "rephrase this sentence the user typed", template-only system prompts). The flag is **required** — the compiler will not let you forget. When in doubt, set `true`; the worst case is a remote provider that could have handled the call is skipped, not a leak.

---

## 9. Testing (`Vitest`)
- **Adapter contract suite:** one shared test that every adapter must pass (streaming yields tokens then `done`, errors map to the right `ProviderErrorKind`, `AbortSignal` cancels). Run against mock HTTP servers — no real network, no keys.
- **Router tests** with fake `Provider`s: role resolution; fallback walks the chain on retryable errors and stops on non-retryable; embeddings auto-route to local; **lockdown blocks remote + vault-content and allows local**; auth surfaces.
- **Secrets:** keys never appear in serialized config or log output (assertion test).
- `isLocal` derivation unit tests across `localhost`, `127.0.0.1`, `::1`, LAN IPs, and remote hosts.

---

## 10. Directory
```
src/ai/
├── provider.ts        # Provider interface + shared types (§3)
├── errors.ts          # ProviderError taxonomy
├── config.ts          # AIConfig + zod schema, load/save (local, not vault)
├── secrets.ts         # SecretStore + Tauri keychain impl
├── router.ts          # AIRouter — routing, fallback, lockdown chokepoint (§7)
├── adapters/          # ⚠ ONLY place vendor SDKs / HTTP specifics may be imported
│   ├── ollama.ts
│   ├── openai-compatible.ts
│   └── anthropic.ts
├── prompts/           # versioned templates (other doc) — produce ChatMessage[]
└── rag/               # uses router.embed('embeddings', …)
```

## 11. Build order
1. Types (`provider.ts`, `errors.ts`) + `config.ts` zod schema.
2. `secrets.ts` (Tauri keychain) + the adapter contract test harness.
3. `OllamaAdapter` first (no auth, fully local → unblocks offline dev).
4. `OpenAICompatibleAdapter` (unlocks OpenRouter + LM Studio + llama.cpp at once).
5. `AnthropicAdapter`.
6. `AIRouter` with routing → then fallback → then the lockdown gate (with tests at each step).
7. Settings UI: add/test providers, assign roles, toggle lockdown.

## 12. Open items
- **Tool/function-calling**: interface reserves `tools` capability but v1 features don't require it; design the message types to extend cleanly later.
- **Token/cost surfacing**: optional usage reporting per call (nice-to-have; remote providers return it, local don't).
- **Streaming embeddings / batching**: batch large embed jobs; cap concurrency to avoid hammering local servers.
