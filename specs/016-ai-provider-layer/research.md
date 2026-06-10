# Research: AI Provider Layer

Phase 0 decisions. Each item: **Decision** · **Rationale** · **Alternatives rejected**. The canonical implementation contract is [ai-provider-layer.md](../../ai-provider-layer.md); these notes resolve the items that were left open or that need to be reconciled with CIC's existing infrastructure patterns.

---

## R1. Keychain mechanism for `SecretStore`

**Decision**: A small custom Tauri command (`ai_keychain_{set,get,delete}`) in `src-tauri/src/lib.rs` wrapping the `keyring` crate (v3). The TypeScript `SecretStore` impl lives at `src/ai/adapters/secrets/tauri.ts` and is the only file in the codebase invoking those commands.

**Rationale**:
- `keyring-rs` v3 wraps the **native OS credential stores** directly: Windows Credential Manager, macOS Keychain Services, Linux libsecret (Secret Service over D-Bus). Zero extra files, zero extra passwords to remember — secrets sit in the same store the user's other apps use.
- Active project, maintained by the Rust security community, used by `cargo login` itself.
- Tiny API surface: `Entry::new(service, username).set_password(secret)` / `.get_password()` / `.delete_password()`. ~30 LOC on the Rust side. Matches the 011 source-file pattern (custom Rust command behind a thin TS seam — DI-friendly for tests).
- The service name is fixed (`"cic.ai.providers"`); the per-provider `apiKeyRef` is the keychain entry's username. This means the keychain UI shows a clean grouping of CIC's keys.
- No new Tauri capability permission needed — the command itself IS the boundary, and Tauri's command allowlist gates it the same way 011's source-file commands are gated.

**Alternatives rejected**:
- **`tauri-plugin-stronghold`**: Wraps Iota Stronghold (encrypted local file with a per-vault password). Adds a UX burden ("remember another password"), and we'd be persisting secrets to *our own file* rather than the OS store the user expects. Overkill for the trust model — a desktop app that the user has installed is allowed to use the OS keychain.
- **Plain `localStorage` / encrypted JSON file via tauri-plugin-fs**: Violates Constitution II (no secret in plaintext, no secret on disk in a format the user wouldn't expect). Hard refusal.
- **`@tauri-apps/plugin-store`**: Same problem — a plain JSON file. Not for secrets.

---

## R2. HTTP / CORS in the Tauri webview

**Decision (REVISED 2026-05-31 — see "Reversal" below)**: Route every adapter HTTP call through
`@tauri-apps/plugin-http` (native Rust `reqwest`), injected as each adapter's `fetchFn` at the
`AIProvider` composition root via the boundary-confined seam `src/ai/adapters/tauriFetch.ts`.

### Reversal (2026-05-31) — the original "plain fetch" decision was empirically wrong on Windows

The original v1 decision (preserved below) was to use plain `globalThis.fetch`. **The live `tauri dev`
quickstart (scenario A) disproved its core premises on Windows/WebView2:**

- **The loopback-is-same-origin premise is false.** On Windows the webview is WebView2 (Chromium); its
  JS runs under a fixed origin (`tauri://localhost` / `http://tauri.localhost`), so a fetch to
  `http://127.0.0.1:1234` **is** cross-origin and subject to Chromium CORS. (Tauri uses WKWebView on
  macOS, which is laxer — hence this is a Windows-specific bite.)
- **The "local servers allow CORS" premise is false.** LM Studio (and Ollama/llama.cpp/vLLM by default)
  send **no** `Access-Control-Allow-Origin` header. Observed symptom: LM Studio logs the `GET /v1/models`
  request and returns HTTP 200 + JSON, but the webview `fetch` rejects with `TypeError` ("Failed to
  fetch") — the textbook CORS signature (request succeeds, response read blocked). Our adapter mapped
  that to `offline`.

**Why plugin-http (the originally-rejected fallback) is correct:** its `fetch` runs the request in the
Rust process (reqwest), outside the webview origin, so CORS never applies. A multi-source research +
adversarial-verification pass (workflow `wf_44b14bb0-720`, 8 agents) confirmed against the plugin's
CHANGELOG that **incremental response-body streaming works as of v2.4.1** (the pre-2.4.0 buffering
reports — issues #2129/#2415 — are CLOSED; PR #2522 fixed blocking; #2557→2.5.5 fixed mid-stream abort;
#3228→2.5.7 fixed a `ReadableStream.cancel()` leak), so the original "we'd lose native streaming"
objection no longer holds. **`Response.body` is a real `ReadableStream<Uint8Array>`**, so the SSE
(`sse.ts`) / NDJSON (`ndjson.ts`) parsers and `AbortSignal` handling are **unchanged**.

**Pins & config:**
- npm `@tauri-apps/plugin-http` **2.5.9** (≥2.5.5 required for the abort + cancel-leak fixes).
- Cargo `tauri-plugin-http = { version = "2", features = ["unsafe-headers"] }` — `unsafe-headers` is
  **load-bearing for Anthropic**: `x-api-key` / `anthropic-version` are browser-forbidden headers that
  reqwest silently drops without it (→ 403, misread as `auth`).
- Capability `http:default` with scope `[{url:"http://**"},{url:"https://**"}]` — broad **by necessity**
  (the OpenAI-compatible adapter targets arbitrary user-configured hosts: OpenRouter, Together, Groq,
  self-hosted, …). **The router remains the authoritative lockdown chokepoint** (Constitution II); the
  HTTP scope is coarse defense-in-depth and cannot enumerate runtime-configured URLs, so it is
  deliberately permissive. `@tauri-apps/plugin-http` is ESLint-confined to `src/ai/adapters/**` and only
  the router invokes adapters, so the broad scope creates no bypass of the lockdown gate.

**Change surface (minimal):** the adapters already accept an injectable `fetchFn: typeof fetch`; the fix
is one new seam + injecting it at the composition root. No adapter-logic, parser, router, or test logic
changed (tests still inject `fakeFetch`).

**Residual risk:** incremental streaming itself is first exercised by the first AI *consumer* (017+,
RAG/tutor) — 016 ships no `chat()` caller, so the live check here is the probe only. If streaming ever
mis-delivers as one buffered blob on the pinned version, the verified-sound contingency is a custom
`#[tauri::command]` + `tauri::ipc::Channel<&[u8]>` behind the *same* `fetchFn` seam (drop-in; no
downstream change).

---

### Original decision (SUPERSEDED — kept for history)

**Decision**: Use plain `globalThis.fetch` directly from each adapter. No `@tauri-apps/plugin-http` in v1.

**Rationale**:
- Tauri 2's webview obeys browser CORS but Anthropic (`api.anthropic.com`), OpenAI (`api.openai.com`), and OpenRouter (`openrouter.ai/api/v1`) all publish CORS-friendly headers because they explicitly support browser-side use (browser SDKs, OpenRouter's web playground, Anthropic's web examples).
- Ollama (`http://localhost:11434`) runs on the same loopback as the webview — no cross-origin question. *(← false on Windows WebView2; see Reversal.)*
- LM Studio / llama.cpp / vLLM run on localhost and explicitly allow CORS for browser dev. *(← false; LM Studio sends no ACAO; see Reversal.)*
- Plain fetch keeps `AbortSignal` and `ReadableStream` semantics native — no proxying through Rust, no buffering of streaming responses.

**Risk acknowledged**: If a particular endpoint ever blocks CORS, the fallback is to add `tauri-plugin-http` later (single adapter swap inside `src/ai/adapters/*`). Documented as a known potential follow-up; doesn't block v1. *(← this risk materialized; the fallback is now the decision.)*

**Alternatives rejected**:
- **`@tauri-apps/plugin-http`**: A Tauri-side HTTP client that bypasses CORS. Adds a permission entry per allowed URL, plus a Rust-side allowlist. Pure overhead in the absence of an actual CORS block. *(← reinstated as the decision once the CORS block proved real.)*
- **Routing every fetch through a custom Rust command** (mirror of 011's file commands): Same overhead, and we'd lose native `ReadableStream` for streaming responses unless we round-tripped chunks over `invoke` events — adds latency and complexity. *(← retained as the contingency if plugin-http streaming ever proves unreliable.)*

---

## R3. SSE / NDJSON streaming parsers

**Decision**: Hand-rolled ~30-LOC parsers in `src/ai/adapters/{sse.ts,ndjson.ts}`. Private to the adapter directory.

**SSE** (OpenAI-compatible, Anthropic):
```
async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of block.split('\n')) {
        if (line.startsWith('data: ')) yield line.slice(6);
      }
    }
  }
}
```
(Equivalent shape for NDJSON: split on `\n`, JSON.parse each line.)

**Rationale**:
- The shape we consume is narrow: only `data: …` lines (we ignore SSE's `event:` / `id:` / `retry:` because none of the three vendors send them in chat streams). NDJSON is even simpler.
- ~30 LOC each. Zero dependencies, zero supply-chain surface, zero version-pinning churn.
- Contract tests verify the partial-chunk edge cases (research R3.1 below) — once those pass, the parser is small enough to keep correct over time.

**R3.1 — Partial-chunk handling**: The buffer-and-scan loop above is robust to any chunking the underlying `ReadableStream` produces (single byte, mid-message, multiple events per chunk). Contract tests slice a known payload at 1-byte, 7-byte, and 100-byte boundaries and verify identical output.

**Alternatives rejected**:
- **`eventsource-parser` npm package**: Pulls in a third-party dep + a transitive maintenance surface for ~30 LOC of inline logic. The package is fine but not justified.
- **EventSource (browser API)**: Doesn't support `POST` request bodies — a hard non-starter for chat completions.

---

## R4. AIConfig persistence location

**Decision**: Reuse the existing SQLite `settings` table (created in m0002, the same KV store used for vault path and the 014 reminder config). Store the whole AIConfig as a JSON string under key `ai.config`. Validate via the `AIConfigSchema` zod schema on every read.

**Rationale**:
- The `settings` table is the established pattern for cross-feature local config (014 reminders, 006 vault path). Reuse it.
- A single key + JSON blob is simpler than a normalized schema and avoids a migration. Zod validation provides the same correctness guarantees as a column-typed schema.
- Atomic: SQLite write is the unit. Concurrent writers (UI + composition root) coordinate naturally.
- Backup-friendly: the user can dump the SQLite file and see all their config in one place.
- The keychain `apiKeyRef` is an opaque string (the provider's `id`) inside the JSON. The secret lives separately in the OS keychain — zero crossover.

**Alternatives rejected**:
- **A new `ai_providers` table + `ai_roles` table + `ai_fallbacks` table**: A reasonable normalized schema but over-engineered for ≤5 providers and ≤3 role assignments. Requires a migration + per-feature tests. Pure overhead.
- **A separate JSON file via `tauri-plugin-fs`**: Splits the user's local state across two places (SQLite + filesystem); breaks the "all config in one place" invariant. Also raises path-portability questions (`appConfigDir` per OS, etc.).
- **A separate Tauri-managed store via `@tauri-apps/plugin-store`**: Same downside; also adds a dep.

---

## R5. ESLint boundary extension

**Decision**: Keep the existing `no-restricted-imports` rule structure; the keychain is accessed
through a custom command (not an importable package), so there's nothing to restrict there. **Updated
2026-05-31 (R2 reversal):** `@tauri-apps/plugin-http` IS an importable package and IS now used (the
`tauriFetch` seam), so a restriction entry was added confining it to `src/ai/adapters/**`, mirroring
the `@tauri-apps/plugin-sql` / `-fs` / `-notification` confinements. (The original note that "we won't
import vendor SDKs / plain fetch suffices" is superseded — see R2.)

**Add a documentation comment** to `eslint.config.js` clarifying that:
1. `src/ai/adapters/**/*` is the only place vendor SDKs may be imported (already in the rule's message).
2. `src/ai/adapters/secrets/tauri.ts` is the only file that should invoke `ai_keychain_*` commands. This is a convention enforced by code review — not a lint rule, because ESLint can't lint `invoke()`'s string arg with reasonable precision.

**Rationale**:
- The existing rule structure (separate `paths:` per restricted package, with `files: ["src/ai/adapters/**/*.{ts,tsx}"]` carve-out) is exactly the pattern the contract doc calls for.
- Three vendor packages (`openai`, `@anthropic-ai/sdk`, plus the dormant `ollama` future) are already noted in the rule. No new entries needed for v1.

**Alternatives rejected**:
- **Add a custom ESLint rule that scans for `invoke("ai_keychain_…")` calls outside the secrets directory**: Possible with a tiny custom rule, but the benefit is marginal vs. PR review + a one-line code comment. Adds plugin maintenance burden.
- **A `tsconfig` `paths` restriction**: Doesn't actually restrict imports — only resolves them.

---

## R6. Adapter contract test harness

**Decision**: A handwritten `src/ai/testing/fakeFetch.ts` builds a `fetch`-shaped function that returns controllable `Response` objects with `body: ReadableStream<Uint8Array>`. The contract suite in `src/ai/testing/contract.ts` is a parametrized describe-block ("for each adapter implementation") that asserts:

1. Streaming yields tokens then a terminal `done: true` chunk.
2. Each `ProviderErrorKind` maps from the right HTTP status / error condition.
3. `AbortSignal.abort()` propagates to a `ProviderError('cancelled', …)` cleanly with no orphaned promises.
4. The partial-chunk slicing (R3.1) doesn't lose or corrupt data.
5. Auth-header redaction in the (absent) log path.

Each adapter accepts a constructor-time `fetch` parameter (defaulting to `globalThis.fetch`); tests inject the fake; production uses the global.

**Rationale**:
- Vitest's `vi.fn()` + a hand-built `ReadableStream` from `new ReadableStream({ start(controller) { ... } })` gives us full control with zero deps. We've already used this pattern in `src/vault/test-support` (controllable in-memory FS).
- "One contract suite per adapter" mirrors a real-world test pattern (Stripe SDK does this for its language bindings). Catches divergence between adapters early.

**Alternatives rejected**:
- **MSW (Mock Service Worker)** v2: Cross-env mocking, supports streaming. Excellent library, but adds a dep + a setup file + service-worker / Node-mock-adapter split. Overkill for our ~3 adapters.
- **undici's MockAgent**: Node-only. Wouldn't run in jsdom for the UI-adjacent tests. We'd need a second mocking strategy for components. Not worth maintaining two.

---

## R7. Streaming + `AbortSignal` semantics

**Decision**: Each adapter:
- Accepts `opts.signal?: AbortSignal` on both `chat` and `embed`.
- Passes the signal directly to `fetch({ signal })`.
- Inside the `for await { reader.read() }` loop, an aborted signal causes `reader.read()` to reject with `DOMException("...", "AbortError")`. The adapter catches `AbortError` specifically and throws `new ProviderError('cancelled', this.id, 'cancelled by caller', false)`.
- Ensures the `ReadableStream` is released (calling `reader.releaseLock()` or letting the GC handle it on rejection).

**Rationale**:
- Native fetch already wires AbortSignal end-to-end: cancellation aborts the request *and* cancels the body stream. Adapters need only translate the resulting `AbortError` into `ProviderError('cancelled', …)`.
- Cancellation is non-retryable (per the contract doc and FR-021) — the router stops walking the fallback chain when it sees `cancelled`.
- The contract suite asserts: (a) the async iterable closes cleanly, (b) no unhandled rejections fire, (c) `errors.kind === 'cancelled'`.

**Alternatives rejected**:
- **Wrap fetch in a Promise.race against a timeout / abort**: Doesn't actually cancel the underlying stream. Leads to orphaned reads. Don't.
- **AbortController per adapter call (ignoring the caller's signal)**: Loses external cancellation. The caller must be able to abort.

---

## R8. Composition root

**Decision**: A new `AIProvider` React context provider at `src/app/providers/AIProvider.tsx`, mounted in `App.tsx` alongside `DbProvider`, `VaultProvider`, and (014's) reminder scheduler. Loads `AIConfig` from SQLite, builds a `Map<providerId, Provider>` via `createProvider(config, secrets)`, instantiates the `defaultRouter`, exposes it via `useAIRouter()`.

DI-friendly: the provider accepts optional `createProviderFn` and `secretStore` props so tests can inject fakes. Production wires `createProvider` (from `src/ai/adapters/index.ts`) and `tauriSecretStore` (from `src/ai/adapters/secrets/tauri.ts`).

**Re-instantiation on config change**: when the AI Settings UI saves a new config, the provider observes the change (via a config version counter in the settings table, or via a callback the UI passes to its hook) and re-builds the adapter map + router. In-flight calls complete normally; subsequent calls use the new config.

**Rationale**:
- Mirrors `DbProvider` (Phase 1) and `VaultProvider` (Phase 1) — established CIC pattern. New developers find it where they expect.
- DI keeps tests off the network and off the keychain.
- A composition root *outside* `src/ai/` keeps the spine pure (no React imports in `src/ai/*`).

**Alternatives rejected**:
- **A singleton `routerInstance` module-level export**: Hard to test, ties global state to module load, breaks DI.
- **Instantiating the router inside each feature consumer**: Violates Constitution IV (features don't construct deep modules) and FR-025 (router is the single chokepoint).

---

## R9. Settings UI host

**Decision**: Extend [SettingsRoute.tsx](../../src/app/routes/settings/SettingsRoute.tsx) with a new `<AISection />` mounted alongside `<NotificationsSettings />`. No new sub-route; one `/settings` page with two sections.

`AISection.tsx` is composed of:
- `<ProviderList />` (list + add + edit + remove)
- `<RoleRoutingEditor />` (three role rows × provider/model + fallback chain)
- `<LockdownToggle />` (single switch + explainer)

State lives in a single `useAIConfig()` hook (mirroring `useNotifications()` from 014) that exposes `{ config, providers, addProvider, editProvider, removeProvider, setRoleTarget, addFallback, toggleLockdown, testConnection }`. The hook calls `router.probe()` for "Test connection" and writes through to the SQLite settings table + keychain (via the injected SecretStore).

**Rationale**:
- One settings page is the right surface for a per-install configuration layer. Users learned the page in 014; we extend it.
- Mirrors 014's structure exactly — a hook + a section + injected seams (Notifier in 014, SecretStore + createProvider here). PR-review effort minimized.

**Alternatives rejected**:
- **A dedicated `/settings/ai` sub-route**: Premature compartmentalization for a page that has two sections.
- **A modal "AI Setup wizard"**: Doesn't fit the calm Obsidian aesthetic. Settings panels are the established pattern.

---

## R10. Build order (locked, normative)

**Decision**: Tasks must follow [ai-provider-layer.md §11](../../ai-provider-layer.md) build order exactly. Each step ships with its tests *before* the next step's tasks open.

1. **Types** — `provider.ts` + `errors.ts` + `config.ts` (zod schema + load/save over the settings table). Tests: zod round-trip, ProviderError construction.
2. **Secrets** — `secrets.ts` (interface only) + the Tauri `ai_keychain_*` Rust command + `adapters/secrets/tauri.ts`. Tests: a fake SecretStore (in-memory map) for downstream tests; the Tauri impl is the live-quickstart check.
3. **Adapter contract harness** — `testing/contract.ts` + `testing/fakeFetch.ts`. Tests: the harness self-verifies against a trivial stub Provider.
4. **OllamaAdapter** — `adapters/ollama.ts` + the NDJSON parser. Tests: chat stream, embed, error mapping, AbortSignal, partial-chunk.
5. **OpenAICompatibleAdapter** — `adapters/openai-compatible.ts` + the SSE parser. Tests: ditto, plus the auth-header path.
6. **AnthropicAdapter** — `adapters/anthropic.ts`. Tests: ditto, plus system-prompt translation.
7. **Router** — `routerImpl.ts`. Tests, in this order: (a) routing resolves role → provider, (b) fallback walks the chain on retryable errors and stops on non-retryable, (c) embed auto-routes to local embeddings when target lacks them, (d) **lockdown gate blocks remote + vault content and allows local**, (e) auth surfaces with an event.
8. **Settings UI** — `AISection.tsx` + sub-components + `useAIConfig.ts`. Tests: provider CRUD, lockdown toggle reflection, "Test connection" wiring (with a fake router).

**Rationale**: This is the dependency order. Earlier layers can be tested in isolation; later layers compose. Implements the Pocock build-order rule ("types → infrastructure → adapters → router → UI") on this feature exactly.

**Alternatives rejected**: any other order. The contract doc is normative; the spec assumptions section calls it out explicitly.

---

## Open items deferred (not blockers)

These items appear in [ai-provider-layer.md §12](../../ai-provider-layer.md) and are deliberately deferred:

- **Tool / function-calling** — `ProviderCapabilities.tools` is reserved in the interface but no implementation. No v1 feature requires it (RAG, tutor, generation are streaming-text features).
- **Token / cost surfacing per call** — optional, remote-only; the relevant provider responses contain the counts and they're easy to thread through later as an optional callback. Out of scope for v1.
- **Streaming embeddings / batching with concurrency caps** — useful when a future RAG ingester hits a local Ollama with thousands of chunks. We'll add it when the ingester ships.
- **Auto-classification of "is this prompt vault content?"** — explicitly NOT a goal. `containsVaultContent` is caller-declared by design (the compiler enforces it).
