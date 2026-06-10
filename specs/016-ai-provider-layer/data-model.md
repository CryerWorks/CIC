# Data Model: AI Provider Layer

The AI provider layer ships **no SQLite schema change**. There is one persisted JSON document (validated by zod), one OS-keychain partition (opaque to the app), and several in-memory types (the spine interfaces — modeled in [contracts/](contracts/)).

This document captures the **logical entity model** so future readers and the planning/analysis steps have a single reference.

## Storage at a glance

| Store | What's there | Format | Validated by |
|---|---|---|---|
| SQLite `settings` table (m0002, existing) | One row: `key='ai.config'`, `value=<JSON string>` | A single `AIConfig` JSON document | `AIConfigSchema` (zod) on every load |
| OS keychain (per-OS native: Windows Credential Manager / macOS Keychain / Linux libsecret) | One entry per remote-provider secret. Service name `cic.ai.providers`, username = the provider's `apiKeyRef` (== provider id), password = the API key | Opaque string | Format validated only at provider call time (auth failure surfaces as `ProviderError('auth', …)`) |

No new tables. No new migrations. No vault content.

## AIConfig — the persisted document

```
AIConfig {
  providers: ProviderConfig[]     // 0..N, distinct by id
  routing:   Record<AIRole, RoleTarget | null>
                                  // exactly 3 keys: reasoning, drafting, embeddings
  lockdown:  boolean              // global "local-only" gate
  version:   number               // monotonically increased on save (R8 — composition-root invalidation)
}
```

### ProviderConfig

```
ProviderConfig {
  id:           string             // stable, opaque, unique across providers[]. Used as keychain username.
  type:         ProviderType       // 'ollama' | 'openai-compatible' | 'anthropic'
  label:        string             // human display name; editable; not load-bearing
  baseUrl?:     string             // required for ollama + openai-compatible; absent for anthropic
  apiKeyRef?:   string             // present iff type requires auth; equals id (1:1 in v1)
  defaultModel?: string            // optional per-call default
  embedModel?:   string            // optional embeddings model (per type's conventions)
}
```

**Validation (zod)**:
- `id`: 1–64 chars, kebab-case allowed; uniqueness checked at save time across the array.
- `type`: one of three literals.
- `label`: 1–80 chars.
- `baseUrl`: when present, a valid `http(s)://…` URL with a host. Trailing slash trimmed.
- `apiKeyRef`: present iff `type === 'openai-compatible' || type === 'anthropic'`. Same string as `id` (no separate ref namespace in v1).
- `defaultModel` / `embedModel`: optional strings, 1–120 chars when present.

**Save-time invariants** (enforced by `saveAIConfig`):
- All `id`s distinct.
- Every `RoleTarget.providerId` in `routing` refers to an existing `ProviderConfig.id` (or the role is `null` = unassigned).
- For `type === 'ollama'`, `baseUrl` must be present (defaulted to `http://localhost:11434` if absent in the form).
- For `type === 'openai-compatible'`, `baseUrl` AND `apiKeyRef` must be present.
- For `type === 'anthropic'`, `apiKeyRef` must be present (the endpoint is hardcoded inside the adapter, per the contract doc).

### RoleTarget — the linked-list fallback chain

```
RoleTarget {
  providerId: string               // FK → ProviderConfig.id
  model:      string               // the model name for THIS step in the chain
  fallback?:  RoleTarget            // optional next step
}
```

**Validation (zod)**:
- `providerId`: 1–64 chars; existence checked at save time.
- `model`: 1–120 chars (vendor-specific format; not parsed here).
- `fallback`: same shape; recursion bounded by save-time cycle detection (a fallback chain MUST be acyclic; cycle = save fails).

**Behavior**:
- `RoleTarget` is a *linked list* (each step has at most one `fallback`), NOT a tree. The natural reading is "first try this; if it fails retryably, try the next; etc."
- The chain ends when `fallback` is `undefined`. A non-retryable error on any step terminates the walk and surfaces.

### AIRole — the routing keys

```
type AIRole = 'reasoning' | 'drafting' | 'embeddings'
```

- **reasoning** — multi-step, careful thought (e.g., a Feynman-style tutor's question generation).
- **drafting** — single-shot rephrasing or scaffolding (e.g., template-shaping for a card front).
- **embeddings** — vector embedding for RAG indexing and retrieval.

The three role names are locked. Adding a fourth role is a future amendment, not a v1 concern.

## In-memory types (not persisted)

These shape the runtime — defined fully in the [contracts/](contracts/) directory but summarized here for the data model.

### ChatOptions / EmbedOptions

The router and adapters accept these per call.

```
ChatOptions {
  model?:               string
  temperature?:         number   // 0..2 typical
  maxTokens?:           number   // positive integer
  stop?:                string[]
  signal?:              AbortSignal
  containsVaultContent: boolean  // REQUIRED — no safe default
}

EmbedOptions {
  model?:               string
  signal?:              AbortSignal
  containsVaultContent: boolean  // REQUIRED — same as ChatOptions
}
```

`containsVaultContent` is the **single input** to the lockdown gate. The compiler forces every caller to declare it.

### ChatChunk / EmbedResult

```
ChatChunk {
  delta: string      // incremental text since the previous chunk
  done:  boolean     // true on the terminal chunk
}

EmbedResult {
  vectors:    number[][]    // one per input, input order preserved
  model:      string
  dimensions: number        // length of each vector
}
```

A streaming chat call yields zero or more `done: false` chunks followed by exactly one `done: true` chunk. Cancellation throws `ProviderError('cancelled', …)` instead of yielding a terminal chunk.

### ProviderCapabilities

```
ProviderCapabilities {
  chat:           boolean
  embeddings:     boolean
  streaming:      boolean
  tools:          boolean         // RESERVED — always false in v1
  contextWindow?: number          // best-effort
  isLocal:        boolean         // COMPUTED from baseUrl host
}
```

`isLocal` is the single flag the lockdown gate reads. It is **computed** from `baseUrl` host (see `isLocalHost(url)` in `src/ai/classification.ts`):

```
isLocalHost(url) ⇔ host ∈ { 'localhost', '127.0.0.1', '::1' }
```

LAN ranges (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`) and remote hosts both return `false`. The settings UI distinguishes `"remote (LAN)"` from `"remote"` via a separate `isLanHost(url)` helper, but the lockdown gate sees only `isLocal`.

### ProviderError

See [contracts/errors.md](contracts/errors.md). The taxonomy:

```
ProviderErrorKind =
  | 'auth'         // not retryable; surface re-auth prompt
  | 'rate_limit'   // retryable
  | 'timeout'      // retryable
  | 'offline'      // retryable
  | 'unsupported'  // retryable (route to fallback); also used by lockdown gate
  | 'bad_response' // not retryable; data error
  | 'cancelled'    // not retryable; user aborted
  | 'unknown'      // not retryable; surface

ProviderError {
  kind:       ProviderErrorKind
  providerId: string
  message:    string
  retryable:  boolean
  cause?:     unknown         // NEVER contains a raw API key or vault content
}
```

## State transitions

There are two interesting state machines.

### Config save (UI → SQLite + keychain)

```
[UI form draft]
   ↓ (user clicks Save)
[validate via AIConfigSchema + save-time invariants (R below)]
   ↓ ok
[upsert keychain entry if apiKeyRef changed]
   ↓ ok
[upsert SQLite settings row, version++]
   ↓ ok
[fire `ai-config-changed` event]
   ↓
[AIProvider re-instantiates router; in-flight calls finish on old router]
```

If the keychain step fails, the SQLite step does NOT run — the on-disk and in-memory states stay consistent. The form surfaces the keychain error.

### Routed call (router → adapter)

```
router.chat(role, msgs, opts) | router.embed(role, texts, opts)
   ↓
resolve role → RoleTarget (or throw if unassigned)
   ↓
=== walk loop ===
fetch Provider for current target (capabilities probed-or-cached)
   ↓
if opts.containsVaultContent AND config.lockdown AND NOT provider.isLocal
   → if target.fallback exists: target = target.fallback; continue loop  ← LOCKDOWN GATE
   → else: throw ProviderError('unsupported', …, retryable:false) "lockdown blocks remote+vault"
   ↓ ok at this step
if role === 'embeddings' AND NOT provider.capabilities().embeddings
   → re-route to configured local embeddings provider (privacy-preserving default)
   ↓
dispatch to provider.chat | provider.embed
   ↓
on retryable ProviderError    → walk RoleTarget.fallback; repeat from "fetch Provider"
on non-retryable              → surface (raise + emit 'auth' event if kind=auth)
on success                    → return / yield
```

**Per-step gating** (Constitution II): the lockdown gate runs at EVERY step of the fallback walk, not just the primary. A `[local→remote]` chain with lockdown ON + vault content + the local primary failing retryably MUST surface the lockdown error from the remote step, never leak vault content. The walk's "skip on lockdown" semantics keeps `[remote→local]` chains usable: the gate skips the remote step and lands on the local step, which serves the call.

The lockdown gate runs **before** the embed re-route at each step. A vault-content embed call with a remote target at the current step is blocked, never silently re-routed.

## Cardinality summary

- `AIConfig` exists in exactly one place per install (the `settings` row).
- `ProviderConfig`s: 0..N (practical cap ~5).
- `RoleTarget`s: 0 or 1 per role × 3 roles = 0..3 trees, each a linked list of length ≥ 1.
- `Stored secret`s: 0..N, one per `ProviderConfig` whose `type` requires auth.

## Relationships to existing CIC data

- **No vault data.**
- **No domain / course / project / session / card / resource / review data.**
- **One existing table touched**: `settings` (m0002). One row, one key (`ai.config`). Nobody else uses that key. Removing the row resets AI to "unconfigured" — safe.

## Validation summary (what zod does)

| Field | Rule |
|---|---|
| `AIConfig.providers[].id` | unique across array; 1–64 chars |
| `AIConfig.providers[].type` | one of three literals |
| `AIConfig.providers[].baseUrl` | valid URL when present; required for ollama / openai-compatible |
| `AIConfig.providers[].apiKeyRef` | present iff type requires auth; equals `id` |
| `AIConfig.routing[role].providerId` | refers to an existing provider id |
| `AIConfig.routing[role].fallback…` | acyclic; same providerId constraint at every level |
| `AIConfig.lockdown` | boolean |
| `AIConfig.version` | integer, monotonically non-decreasing across loads |
| `ChatOptions.containsVaultContent` | boolean, **required** (no `.optional()`) |
| `EmbedOptions.containsVaultContent` | boolean, **required** |
