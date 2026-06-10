# Tasks: AI Provider Layer (Feature 016)

**Input**: Design documents from [specs/016-ai-provider-layer/](./)

**Prerequisites**:
- [plan.md](plan.md) — tech stack, structure, constitution check.
- [spec.md](spec.md) — 3 user stories (P1 local Ollama · P2 remote provider + lockdown · P3 fallback chain), 27 FRs, 9 SCs.
- [research.md](research.md) — 10 decisions locked.
- [data-model.md](data-model.md) — AIConfig zod shape; no SQLite schema change.
- [contracts/](contracts/) — 7 contracts (Provider interface, errors, config, secrets, router, adapter contract, UI).
- [quickstart.md](quickstart.md) — live `tauri dev` scenarios A–J.
- [ai-provider-layer.md](../../ai-provider-layer.md) — canonical implementation contract (build order in §11 is normative for this tasks file).

**Tests**: Tests are first-class for this feature. The Constitution V quality gate (Vitest passing for the data-integrity surfaces + the lockdown gate + provider routing) requires them. They're written alongside (not strict TDD) — but each adapter/router task ships with its tests in the same logical step.

**Organization**: Tasks are grouped by phase, then by user story per ai-provider-layer.md §11 build order. Phase 2 (Foundational) is large because the entire spine + secrets infrastructure + adapter contract harness is shared across all stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: US1 / US2 / US3 inside user-story phases. No story label in Setup / Foundational / Polish.

## Path Conventions

Single-project layout (existing repo). Paths from repo root:
- `src/ai/` — the new AI spine + deep adapters (this feature).
- `src/features/settings/ai/` — the new `/settings` AI section.
- `src/app/providers/AIProvider.tsx` — composition root.
- `src-tauri/` — Rust keychain command + Cargo.toml.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new directory structure + add the single Rust dependency.

- [X] T001 Create `src/ai/` directory tree per [plan.md §Project Structure](plan.md): `src/ai/` (spine), `src/ai/adapters/` (deep), `src/ai/adapters/secrets/`, `src/ai/testing/`, `src/features/settings/ai/`, `src/app/providers/` (existing, no action). Use empty `.gitkeep` if necessary; the directories are created naturally by the first file in each.
- [X] T002 [P] Add `keyring = "3"` to `[dependencies]` in `src-tauri/Cargo.toml` (only addition; no version pin of other deps).
- [X] T003 [P] Add a documentation comment block to `eslint.config.js` (above the existing `no-restricted-imports` rule, lines ~30-50) explaining that `src/ai/adapters/secrets/tauri.ts` is the only intended invoker of `ai_keychain_*` commands (convention-enforced, not lint-enforced — per research R5). No rule change.
- [X] T004 [P] Add an `AI_CONFIG_KEY` constant (`'ai.config'`) to `src/db/repositories/settings.ts` (or co-located in `src/ai/config.ts` if cleaner — the implementation decides). Plan reads/writes go through this constant exclusively.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The entire AI spine + secrets infrastructure + adapter contract harness + composition-root scaffolding. Every user story depends on this. Follows the ai-provider-layer.md §11 build order: Types → Errors → Config → Secrets → Adapter contract harness → Composition root → Settings section scaffold.

**⚠️ CRITICAL**: No user-story phase begins until Phase 2 is complete.

### 2.1 Spine types

- [X] T005 Implement [src/ai/provider.ts](../../src/ai/provider.ts) per [contracts/provider-interface.md](contracts/provider-interface.md): `Provider` interface, `ChatMessage`, `ChatOptions` (with **required** `containsVaultContent`), `ChatChunk`, `EmbedOptions`, `EmbedResult`, `ProviderCapabilities`, `ProviderType`. No implementations, no third-party imports, no React.
- [X] T006 [P] Implement [src/ai/errors.ts](../../src/ai/errors.ts) per [contracts/errors.md](contracts/errors.md): `ProviderError` class (kind + providerId + retryable + cause), `ProviderErrorKind` union, `isRetryable` / `isAuthFailure` / `isCancellation` predicates.
- [X] T007 [P] Vitest unit tests for `src/ai/errors.ts` in `src/ai/errors.test.ts`: constructor sets all fields; predicates return correctly for each kind; `JSON.stringify(err)` doesn't leak a tainted `.cause` (verified via a redaction helper at construction).

### 2.2 Classification helper

- [X] T008 [P] Implement [src/ai/classification.ts](../../src/ai/classification.ts): pure `isLocalHost(url: string): boolean` (true only for `localhost` / `127.0.0.1` / `::1`) + `isLanHost(url: string): boolean` (true for RFC1918 ranges `192.168.x.x` / `10.x.x.x` / `172.16-31.x.x`). Used by adapter capabilities + the settings UI's badge.
- [X] T009 [P] Vitest unit tests for `src/ai/classification.ts` in `src/ai/classification.test.ts`: localhost / 127.0.0.1 / ::1 → `isLocal:true`; LAN ranges → `isLocal:false isLan:true`; remote hosts → both false; malformed URL → both false (no throws).

### 2.3 Config

- [X] T010 Implement [src/ai/config.ts](../../src/ai/config.ts) per [contracts/config.md](contracts/config.md): `AIConfigSchema` + `ProviderConfigSchema` + `RoleTargetSchema` (recursive, cycle-detecting) zod schemas; types; `emptyAIConfig()`; `loadAIConfig(db)` and `saveAIConfig(db, config)` over the `settings` table; `AIConfigError` class. Uses `getSetting` / `setSetting` from `src/db/repositories/settings.ts`.
- [X] T011 [P] Vitest unit tests for `src/ai/config.ts` in `src/ai/config.test.ts` (`@vitest-environment node` + NodeSqlExecutor + migrate): `emptyAIConfig()` validates; save→load round-trip preserves everything and bumps version by 1; duplicate provider id throws with issue mentioning "id"; role target pointing at non-existent provider throws; cyclic fallback chain throws; load on empty table returns `emptyAIConfig()`; corrupt JSON throws `AIConfigError`; the three ai-provider-layer.md §4 example configs all parse.

### 2.4 Secrets

- [X] T012 [P] Implement [src/ai/secrets.ts](../../src/ai/secrets.ts) per [contracts/secrets.md](contracts/secrets.md): `SecretStore` interface (set/get/delete) + `InMemorySecretStore` class (Map-backed; for tests + the contract suite).
- [X] T013 [P] Vitest unit tests for `InMemorySecretStore` in `src/ai/secrets.test.ts`: set/get round-trip; overwrite-by-default on set; delete idempotent (succeeds on missing); get-missing returns `null` (not undefined, not a throw).
- [X] T014 Implement the Rust keychain commands in `src-tauri/src/lib.rs` per [contracts/secrets.md](contracts/secrets.md): `ai_keychain_set`, `ai_keychain_get`, `ai_keychain_delete` wrapping `keyring::Entry::new("cic.ai.providers", &ref)`. Register the three handlers in the existing `tauri::generate_handler!` call. Map `keyring::Error::NoEntry` to `Ok(None)` on get and `Ok(())` on delete; all other errors become `Err(e.to_string())`. ~30 LOC total.
- [X] T015 Implement [src/ai/adapters/secrets/tauri.ts](../../src/ai/adapters/secrets/tauri.ts) per [contracts/secrets.md](contracts/secrets.md): `TauriKeychainSecretStore` class implementing `SecretStore`, wrapping `invoke('ai_keychain_*', { ref, secret? })`. `SecretStoreError` class. Empty-ref / empty-secret guards.
- [X] T016 [P] Vitest unit test for `TauriKeychainSecretStore` in `src/ai/adapters/secrets/tauri.test.ts`: mock `@tauri-apps/api/core::invoke`; assert command name + args per method; underlying invoke error surfaces as a thrown error with message preserved (sans secret).

### 2.5 Streaming parsers

- [X] T017 [P] Implement [src/ai/adapters/sse.ts](../../src/ai/adapters/sse.ts) — `async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<string>` per research R3: TextDecoder + buffer + split-on `\n\n` + filter `data: …` lines. ~30 LOC.
- [X] T018 [P] Vitest unit tests for `sse.ts` in `src/ai/adapters/sse.test.ts`: canonical SSE payload → expected `data:` strings; partial chunks at 1/7/100-byte slicing → identical output; non-`data:` lines ignored; AbortSignal cancellation closes the iterator cleanly.
- [X] T019 [P] Implement [src/ai/adapters/ndjson.ts](../../src/ai/adapters/ndjson.ts) — `async function* parseNdjsonStream(body: ReadableStream<Uint8Array>): AsyncIterable<unknown>` per research R3: TextDecoder + buffer + split-on `\n` + JSON.parse each line. ~20 LOC.
- [X] T020 [P] Vitest unit tests for `ndjson.ts` in `src/ai/adapters/ndjson.test.ts`: canonical NDJSON → expected parsed objects; partial chunks at 1/7/100-byte slicing → identical output; malformed line throws `bad_response` shape (adapter consumer decides what to do — parser surfaces the parse error).

### 2.6 Adapter contract test harness

- [X] T021 Implement [src/ai/testing/fakeFetch.ts](../../src/ai/testing/fakeFetch.ts) per [contracts/adapter-contract.md](contracts/adapter-contract.md): `fakeFetch(spec)`, `streamChunks(chunks, gapMs?)`, `sliceBytes(s, n)` helpers. Honors `AbortSignal` end-to-end (cancellation propagates to the stream's cancel callback).
- [X] T022 [P] Vitest unit tests for `fakeFetch` in `src/ai/testing/fakeFetch.test.ts`: `streamChunks` yields in order with gaps; `sliceBytes('hello', 2)` → `['he','ll','o']`; aborted signal causes the returned fetch to reject with `AbortError` AND the stream to cancel.
- [X] T023 Implement [src/ai/testing/contract.ts](../../src/ai/testing/contract.ts) per [contracts/adapter-contract.md](contracts/adapter-contract.md): `runAdapterContract(cases: ContractCase[])` — parametrized describe-block asserting A1..A14 invariants. Self-tests against a trivial stub `Provider`.

### 2.7 Composition root + adapter factory scaffolding

- [X] T024 Implement [src/ai/adapters/index.ts](../../src/ai/adapters/index.ts) — `createProvider(config: ProviderConfig, secrets: SecretStore, fetchFn?: typeof fetch): Provider`. In this phase: switches on `config.type` and throws `Not implemented` for each — the real implementations land in US1 (T035) / US2 (T049, T052). The signature is locked here so the composition root + tests can be written against it.
- [X] T025 Implement [src/ai/router.ts](../../src/ai/router.ts) — `AIRouter` interface (chat / embed / probe). Spine, no implementation. (Implementation lands in T030 + T031 in US1.)
- [X] T026 Implement [src/app/providers/AIProvider.tsx](../../src/app/providers/AIProvider.tsx) per research R8: React context provider that loads `AIConfig` on mount + builds `Map<string, Provider>` via `createProvider` + instantiates the router. DI props for `createProviderFn` and `secretStore`. `useAIRouter()` hook. Re-instantiates on `'ai-config-changed'` event from useAIConfig save.
- [X] T027 [P] Vitest unit tests for `AIProvider` in `src/app/providers/AIProvider.test.tsx` (jsdom): DI-fakes wire correctly; `useAIRouter` returns the wired router; saving a new config (via fake `useAIConfig`) re-instantiates the router; config-load error surfaces gracefully without crashing.

### 2.8 Settings page scaffold

- [X] T028 Add `<AISection />` placeholder mount to [src/app/routes/settings/SettingsRoute.tsx](../../src/app/routes/settings/SettingsRoute.tsx) (after `<NotificationsSettings />`). Create [src/features/settings/ai/AISection.tsx](../../src/features/settings/ai/AISection.tsx) with the "AI Providers" `<Panel title>` heading and an empty-state ("No providers configured yet — add one to get started.").
- [X] T028a Implement the **`AIConfigError` UI fallback** in [src/features/settings/ai/AISection.tsx](../../src/features/settings/ai/AISection.tsx) per [contracts/ui-settings.md "AISection"](contracts/ui-settings.md) and FR-003: catch `AIConfigError` from `loadAIConfig` (surfaced via `useAIConfig.loadError`) and render a top-level `<Callout variant="warn" title="Your AI configuration could not be loaded">` with a short explanation ("The on-disk config is corrupt or its shape doesn't match the expected schema.") + a **"Reset to defaults"** action that calls `saveAIConfig(db, emptyAIConfig())` after a confirm dialog. After reset, the section reverts to the empty state. No crash, no infinite loading spinner — closes FR-003 at the UI layer (the DB-layer coverage is in T010/T011).
- [X] T028b [P] Vitest jsdom test for T028a in `src/features/settings/ai/AISection.config-error.test.tsx`: simulate `useAIConfig` returning `{ loadError: new AIConfigError([...]) }` → the Callout renders with the right title + "Reset to defaults" button → clicking the button triggers the confirm → confirming calls `saveAIConfig` with an `emptyAIConfig` → the Callout disappears and the empty-state renders.
- [X] T029 Implement [src/features/settings/ai/useAIConfig.ts](../../src/features/settings/ai/useAIConfig.ts) per [contracts/ui-settings.md](contracts/ui-settings.md): the hook contract (loading, config, **loadError** (for T028a), probes, addProvider/editProvider/removeProvider, setRoleTarget/addFallback/removeFallback, setLockdown, testConnection, refresh). Uses `useAIRouter()` + `useDb()`. Saves via `saveAIConfig` + `secrets.set` orchestration. Fires the `'ai-config-changed'` event after a successful save. On a load error: sets `loadError: AIConfigError` (not a throw); the UI surface (T028a) handles it. A successful `refresh` clears `loadError`.
- [X] T030 [P] Vitest tests for `useAIConfig` in `src/features/settings/ai/useAIConfig.test.tsx` (jsdom): provider CRUD round-trips through fake router/db/secrets; lockdown toggle persists; `'ai-config-changed'` is fired after a successful save.

**Checkpoint Phase 2**: Spine complete; secrets working end-to-end (TS + Rust); adapter contract harness ready; composition root + Settings scaffold mounted. **No adapters yet, no router policy yet.** All user-story phases unblocked.

---

## Phase 3: User Story 1 — Configure a fully local AI provider (Priority: P1) 🎯 MVP

**Goal**: Learner adds a local Ollama in `/settings`, tests it, assigns it to all three roles, lockdown ON keeps the app fully offline-capable. End state: a working local AI infrastructure with no network involvement.

**Independent Test**: Quickstart Scenario A + E + F + I. With Ollama running locally, add the provider via `/settings`, click Test connection, see latency + capability tags + "local" badge, assign to roles, save, restart the app, confirm the configuration persists. Disconnect the network — everything still works.

### Router for US1 (routing + lockdown gate, NO fallback yet)

- [X] T031 [P] [US1] Implement the routing/probe slice of [src/ai/routerImpl.ts](../../src/ai/routerImpl.ts) per [contracts/router.md](contracts/router.md) "Resolution & dispatch": `defaultRouter({config, providers, emit?})` returns an `AIRouter`. `chat`/`embed` resolve role → `RoleTarget`, enter the walk loop. **Each step of the walk runs the lockdown gate** (per L1, per-step gating; Constitution II "regardless of any other configuration"): a `target` whose provider is non-local + lockdown ON + `containsVaultContent: true` → skip to `target.fallback` if it exists, else throw `ProviderError('unsupported', …, false)` "local-only lockdown blocks…". Then dispatch. **NO retryable-error fallback walking in this task** (deferred to T065 in US3) — but the per-step gate's "skip to fallback" path IS implemented here, because the gate is a synchronous check before dispatch, not an error-driven walk. **NO embed re-route** (deferred to T066). `probe(providerId, {force?})` with a `(providerId, baseUrl, configVersion)`-keyed in-memory cache.
- [X] T032 [P] [US1] Vitest unit tests for the router's **lockdown gate** in `src/ai/routerImpl.lockdown.test.ts`: (1) `containsVaultContent: true` + lockdown ON + remote primary + no fallback → throws `ProviderError('unsupported', …, false)` with "local-only lockdown" in the message; (2) lockdown ON + local primary → passes through; (3) `containsVaultContent: false` + lockdown ON + remote → passes through (the gate doesn't trip on non-vault content); (4) gate trips on `embed` exactly as on `chat` (FR-012); (5) **per-step regression** (C1 fix): `[remote→local]` chain with lockdown ON + vault content → the gate skips the remote step, lands on local, which serves the call (the remote provider's `chat`/`embed` is never invoked — assert via spy). Use fake Providers; no network.
- [X] T033 [P] [US1] Vitest unit tests for **routing resolution** in `src/ai/routerImpl.routing.test.ts`: unassigned role → throws `'unsupported'` "role unassigned"; assigned role → calls the right provider's `chat`/`embed`; provider not in the providers map → throws `'unsupported'` "provider not loaded".
- [X] T034 [P] [US1] Vitest unit tests for **probe cache** in `src/ai/routerImpl.probe.test.ts`: first probe call delegates to the provider's `capabilities()`; second call (same id, no `force`) returns cached; `{force:true}` re-delegates; config version bump invalidates the cache.

### OllamaAdapter

- [X] T035 [US1] Implement [src/ai/adapters/ollama.ts](../../src/ai/adapters/ollama.ts) per [contracts/adapter-contract.md](contracts/adapter-contract.md): `OllamaAdapter` implementing `Provider`. `chat` → `POST {baseUrl}/api/chat` with NDJSON stream parsed by `parseNdjsonStream`; yield `{ delta, done }` per line. `embed` → `POST {baseUrl}/api/embeddings` per input (single-input API; iterate internally in order). `capabilities()` → `{ chat:true, embeddings:true, streaming:true, tools:false, isLocal: isLocalHost(this.baseUrl) }`. `id`, `type:'ollama'`. Constructor accepts injected `fetch`. Error mapping per [contracts/errors.md](contracts/errors.md), with `ECONNREFUSED` → `'offline'` + "couldn't reach Ollama at <baseUrl> — is it running?" message.
- [X] T036 [US1] Wire `OllamaAdapter` into [src/ai/adapters/index.ts](../../src/ai/adapters/index.ts) `createProvider` switch: `case 'ollama'` returns `new OllamaAdapter({...})`. (Other cases still throw `Not implemented`.)
- [X] T037 [P] [US1] Adapter contract suite registration in `src/ai/adapters/ollama.contract.test.ts`: call `runAdapterContract([{ name: 'OllamaAdapter', makeAdapter, vendor: {...}, isLocalExpected }])` — exercises A1..A14 against the Ollama-specific fake responses (NDJSON streaming chat + JSON embed + 401/429/timeout/ECONNREFUSED/malformed body cases).
- [X] T038 [P] [US1] Vitest unit tests in `src/ai/adapters/ollama.test.ts` for adapter specifics: chat NDJSON parsing yields chunks immediately (timestamping); `embed(['a', 'b'])` iterates the single-input API and preserves order; `ECONNREFUSED` produces the specific "is Ollama running?" message.

### Settings UI for US1

- [X] T039 [US1] Implement [src/features/settings/ai/ProviderForm.tsx](../../src/features/settings/ai/ProviderForm.tsx) per [contracts/ui-settings.md](contracts/ui-settings.md), **for `type: ollama` only in this phase**: fields are `id` (immutable on edit), `type` (locked to 'ollama' here; the select is present for future extensibility), `label`, `baseUrl` (default `http://localhost:11434`), `defaultModel`, `embedModel`. Save disabled until required fields valid. On save: orchestrates `saveAIConfig` via `useAIConfig.addProvider` / `editProvider`.
- [X] T040 [US1] Implement [src/features/settings/ai/ProviderList.tsx](../../src/features/settings/ai/ProviderList.tsx): renders `config.providers` as tiles per [contracts/ui-settings.md](contracts/ui-settings.md) (label · type tag · local/remote/remote (LAN) tag · Edit · Test connection · Remove). "Test connection" wires to `useAIConfig.testConnection`, renders capability tags + latency + the local/remote classification. Confirmation dialog on Remove (mirrors 014/015 pattern).
- [X] T041 [US1] Implement [src/features/settings/ai/LockdownToggle.tsx](../../src/features/settings/ai/LockdownToggle.tsx): single toggle bound to `useAIConfig.setLockdown` + the explainer paragraph from [contracts/ui-settings.md](contracts/ui-settings.md).
- [X] T042 [US1] Implement [src/features/settings/ai/RoleRoutingEditor.tsx](../../src/features/settings/ai/RoleRoutingEditor.tsx), **primary-only in this phase**: three rows (reasoning/drafting/embeddings) × provider select + model text input. **NO `+ Add fallback` affordance** (deferred to T070 in US3). Bound to `useAIConfig.setRoleTarget`.
- [X] T043 [US1] Mount `<ProviderList />`, `<RoleRoutingEditor />`, `<LockdownToggle />` into [src/features/settings/ai/AISection.tsx](../../src/features/settings/ai/AISection.tsx) in that order, each in its own `<Panel>`.
- [X] T044 [P] [US1] Vitest jsdom tests for `ProviderForm` (ollama type) in `src/features/settings/ai/ProviderForm.test.tsx`: required-field gating; baseUrl defaults to `http://localhost:11434`; save calls `addProvider` with the expected input.
- [X] T045 [P] [US1] Vitest jsdom tests for `ProviderList` in `src/features/settings/ai/ProviderList.test.tsx`: renders a tile per provider with the right classification tag; "Test connection" calls `testConnection` and renders the result (success path + error path); Remove triggers the confirmation dialog → calls `removeProvider`.
- [X] T046 [P] [US1] Vitest jsdom tests for `RoleRoutingEditor` (primary-only) in `src/features/settings/ai/RoleRoutingEditor.test.tsx`: assigning a provider+model to a role saves via `setRoleTarget`; switching providers reflects in the saved config.
- [X] T047 [P] [US1] Vitest jsdom tests for `LockdownToggle` in `src/features/settings/ai/LockdownToggle.test.tsx`: initial state reflects `config.lockdown`; toggling calls `setLockdown(!prev)`; the explainer text is rendered.
- [X] T048 [P] [US1] End-to-end Vitest jsdom test for US1 happy path in `src/features/settings/ai/AISection.test.tsx`: add Ollama → Test connection succeeds → assign to all three roles → save → verify `useAIConfig.config` reflects the change → simulate a config reload (call `refresh`) → assert the providers, routing, and lockdown all round-trip. Uses fake Provider + fake SecretStore + fake DB.

**Checkpoint US1**: A learner can configure a local Ollama, test it, assign it to all three roles, and toggle lockdown. With Ollama running, the entire `/settings` AI section behaves end-to-end. Quickstart Scenarios A, E, F, I pass live.

---

## Phase 4: User Story 2 — Remote provider with secure key storage (Priority: P2)

**Goal**: Learner adds a remote provider (OpenAI-compatible or Anthropic) with an API key stored in the OS keychain. Lockdown reflection makes the privacy story obvious. Keys never appear on disk; removing a provider cascades to the keychain.

**Independent Test**: Quickstart Scenarios B, C, D, H, J. With a remote API key, add a remote provider, verify the key sits in the OS keychain but NOT in `SELECT value FROM settings WHERE key='ai.config'`, see "remote" / "remote (LAN)" classifications correctly, lockdown ON shows "vault content blocked" badges on remote rows, invalid key produces a clear `auth` error, removing the provider also removes the keychain entry.

### OpenAI-compatible adapter

- [X] T049 [US2] Implement [src/ai/adapters/openai-compatible.ts](../../src/ai/adapters/openai-compatible.ts): `OpenAICompatibleAdapter` implementing `Provider`. `chat` → `POST {baseUrl}/v1/chat/completions` with `stream:true`, SSE parsed by `parseSseStream`; extracts `choices[0].delta.content` per event; `data: [DONE]` terminates with `{ delta:'', done:true }`. `embed` → `POST {baseUrl}/v1/embeddings` with `input: texts`; returns vectors in order. `capabilities()` → chat/embeddings/streaming all true, `isLocal` from `isLocalHost(baseUrl)`. `Authorization: Bearer <key>` header (key fetched from SecretStore at call time, NEVER on the instance). Probe → `GET {baseUrl}/v1/models` (200 with list = full caps; 404 = "best-effort" caps with chat/embed/streaming defaulted true).
- [X] T050 [US2] Wire `OpenAICompatibleAdapter` into `createProvider` switch in `src/ai/adapters/index.ts`: `case 'openai-compatible'` returns `new OpenAICompatibleAdapter({...})`.
- [X] T051 [P] [US2] Adapter contract suite registration in `src/ai/adapters/openai-compatible.contract.test.ts`: runs `runAdapterContract` against the SSE-streaming fake responses. PLUS an extra "no Bearer header value leaks in error stringification" assertion (A11 + A14).

### Anthropic adapter

- [X] T052 [US2] Implement [src/ai/adapters/anthropic.ts](../../src/ai/adapters/anthropic.ts): `AnthropicAdapter` implementing `Provider`. `chat` → `POST https://api.anthropic.com/v1/messages` (hardcoded endpoint; no `baseUrl`) with `stream:true`, SSE parsed by `parseSseStream`; consumes `content_block_delta` events' `delta.text`. **System prompt translation**: split `ChatMessage[]` by `role === 'system'`; join system contents → top-level `system` body field; messages array contains user/assistant only. `embed` → throws `ProviderError('unsupported', this.id, 'anthropic has no embeddings endpoint', true)` (retryable so the router's embed re-route fires later in US3). `capabilities()` → chat/streaming true, embeddings false, `isLocal:false`. `x-api-key: <key>` + `anthropic-version: 2023-06-01` headers. Probe → minimal `POST /v1/messages` with `max_tokens:1`.
- [X] T053 [US2] Wire `AnthropicAdapter` into `createProvider` switch: `case 'anthropic'`. (At this point all three cases are wired; the "Not implemented" stubs from T024 are gone.)
- [X] T054 [P] [US2] Adapter contract suite registration in `src/ai/adapters/anthropic.contract.test.ts`: runs `runAdapterContract` + extra tests for system-prompt translation (a `ChatMessage[]` with `system` messages translates correctly into the body), `embed` throws `'unsupported'` retryable, no `x-api-key` value leaks in any error.

### Settings UI extensions for US2

- [X] T055 [US2] Extend [src/features/settings/ai/ProviderForm.tsx](../../src/features/settings/ai/ProviderForm.tsx) with kind-driven fields for **`openai-compatible`** (baseUrl + apiKey + defaultModel + embedModel) and **`anthropic`** (apiKey + defaultModel — no baseUrl, no embedModel since embeddings are unsupported). API key field: password input + show/hide toggle (eye icon); trim pasted whitespace before storage. On edit mode: show `••••••••` placeholder (the existing key is in the keychain; we DO NOT fetch it back into the form — see [contracts/ui-settings.md](contracts/ui-settings.md)); leaving it as `••••••••` means "don't change the secret". On save with a real value: `secrets.set(id, value.trim())` before `saveAIConfig`.
- [X] T056 [US2] Extend [src/features/settings/ai/ProviderList.tsx](../../src/features/settings/ai/ProviderList.tsx) tile classification badge: render `local` (brand) / `remote (LAN)` (warn, with tooltip) / `remote` (neutral) per `isLocalHost` + `isLanHost` + Anthropic's hardcoded `isLocal:false`. Per [contracts/ui-settings.md](contracts/ui-settings.md).
- [X] T057 [US2] Wire the `'ai:auth-failed'` event in [src/app/providers/AIProvider.tsx](../../src/app/providers/AIProvider.tsx): expose via `useAIRouter`'s emit; `useAIConfig` listens and surfaces a `reAuthRequired: Set<providerId>` state; `ProviderList` tiles render a "Re-enter API key" affordance on those providers. Router-side: `routerImpl.ts` already calls `emit('ai:auth-failed', { providerId })` on `auth` failure (per [contracts/router.md](contracts/router.md) L4) — this task wires the consumer side.
- [X] T058 [US2] Add lockdown reflection to [src/features/settings/ai/RoleRoutingEditor.tsx](../../src/features/settings/ai/RoleRoutingEditor.tsx): when `config.lockdown === true`, render a "vault content blocked by lockdown" badge (warn amber) on any role row whose primary provider is not local. Hover-tooltip explains FR-013.
- [X] T059 [US2] Extend `useAIConfig.removeProvider` in [src/features/settings/ai/useAIConfig.ts](../../src/features/settings/ai/useAIConfig.ts): warns when the provider serves a role (lists affected roles in the confirmation dialog); on confirm: `secrets.delete(id)` first (idempotent — safe even for ollama providers with no key), then `saveAIConfig` with the provider removed AND any role assignments referencing it cleared.
- [X] T060 [P] [US2] Vitest jsdom tests for `ProviderForm` with the API key field in `src/features/settings/ai/ProviderForm.apikey.test.tsx`: pasted whitespace is trimmed; show/hide toggle reveals/masks; edit mode shows `••••••••` and a save with the masked value LEAVES the keychain unchanged; a real value triggers `secrets.set`.
- [X] T061 [P] [US2] Vitest jsdom test for LAN classification badge in `src/features/settings/ai/ProviderList.lan.test.tsx`: a provider at `http://192.168.1.50:11434` shows "remote (LAN)" with the tooltip text per FR-010 visible on hover.
- [X] T062 [P] [US2] Vitest jsdom test for lockdown reflection in `src/features/settings/ai/RoleRoutingEditor.lockdown.test.tsx`: assign a remote provider to a role + lockdown OFF → no badge; toggle lockdown ON → badge appears; toggle OFF → badge disappears.
- [X] T063 [P] [US2] Vitest jsdom test for the auth-failed flow in `src/features/settings/ai/ProviderList.auth.test.tsx`: simulate the router emitting `'ai:auth-failed'` for a providerId → that tile renders the "Re-enter API key" affordance; clicking it opens the edit form.
- [X] T064 [P] [US2] Vitest jsdom test for `useAIConfig.removeProvider` cascade in `src/features/settings/ai/useAIConfig.remove.test.tsx`: removing a provider that serves a role surfaces the warning; on confirm: secret is deleted (verified via fake SecretStore); role assignments referencing it are cleared in the saved config.

**Checkpoint US2**: Remote providers configurable; keys safely in the OS keychain; local/remote/LAN classifications correctly surfaced; lockdown reflection makes privacy obvious; provider removal cascades correctly. Quickstart Scenarios B, C, D, H, J pass live.

---

## Phase 5: User Story 3 — Fallback chains for graceful degradation (Priority: P3)

**Goal**: Learner configures a primary + fallback chain on each role. Router walks the chain on retryable errors. Privacy-preserving embed re-route runs after the lockdown gate.

**Independent Test**: Quickstart Scenario G (configure chain + verify ordering + edit). The user-visible fallback experience (real fallback on a real failure) ships with the first AI consumer (017+); the router semantics are verified here by the test suite.

### Router fallback + embed re-route

- [X] T065 [US3] Extend [src/ai/routerImpl.ts](../../src/ai/routerImpl.ts) with the retryable-error fallback walk per [contracts/router.md](contracts/router.md) "Resolution & dispatch": on retryable `ProviderError` from the dispatched call (`rate_limit` / `timeout` / `offline` / `unsupported`-from-the-adapter) → walk to `RoleTarget.fallback` and retry from the top of the loop (which re-runs the lockdown gate per invariant L1 — already in T031); on non-retryable (`auth` / `cancelled` / `bad_response` / `unknown` / `unsupported`-from-the-lockdown-gate) → surface immediately. **Key invariant** (Constitution II): walking past a failed local step to a remote step under lockdown + vault content MUST hit the per-step gate (already in T031) and surface "lockdown blocks" — never silently invoke the remote adapter. T067a verifies this regression explicitly.
- [X] T066 [US3] Extend `routerImpl.ts` with the **embed capability re-route** per [contracts/router.md](contracts/router.md): for `embed` calls, **after** the lockdown gate accepts, if the resolved provider's `capabilities().embeddings === false`, transparently re-route to the **local** embeddings provider found anywhere in the embeddings-role chain (`findLocalEmbeddings(providers, config)`). If no local embeddings provider exists, fall through to the original provider's `embed`, which will throw `unsupported`, triggering the fallback walk normally.
- [X] T067 [P] [US3] Vitest unit tests for the fallback walk in `src/ai/routerImpl.fallback.test.ts`: a chain `[A→B→C]` with A throwing each of `rate_limit`/`timeout`/`offline`/`unsupported` retryable → B serves; A throwing `bad_response`/`auth`/`cancelled`/`unknown` non-retryable → surfaces A's error, B is NOT consulted; chain fully fails on retryable errors → surfaces the last error from C; `'ai:auth-failed'` event emitted on auth.
- [X] T067a [P] [US3] **C1 privacy-leak regression** — Vitest unit test in `src/ai/routerImpl.lockdown-walk.test.ts`: a `[local→remote]` chain with lockdown ON + `containsVaultContent: true`, where the **local primary throws `offline` (retryable)**. Assert: the walker steps to the remote fallback, the per-step gate trips, and the call throws `ProviderError('unsupported', remoteId, …, false)` with "local-only lockdown" in the message — AND the remote provider's `chat`/`embed` (spied via the fake Provider) is **never invoked**. This is the Constitution II non-negotiable: vault content cannot reach a non-local provider regardless of any other configuration (chain shape, retryable failures, anything). Repeat the same assertion for `embed`. Without this test, the C1 finding would re-emerge silently on any future router refactor.
- [X] T068 [P] [US3] Vitest unit tests for embed re-route in `src/ai/routerImpl.embed-route.test.ts`: embeddings-role chain `[OpenAI→OllamaLocal]` where OpenAI has embeddings → uses OpenAI; chain `[Anthropic→OllamaLocal]` where Anthropic lacks embeddings → re-routes to OllamaLocal (the local-embeddings step in the chain); chain `[Anthropic]` with no local embeddings step → throws `unsupported` and walks the chain (which is empty here, so surfaces).
- [X] T069 [P] [US3] Vitest unit test for the **gate-then-reroute invariant** in `src/ai/routerImpl.gate-vs-reroute.test.ts`: (1) `containsVaultContent: true`, lockdown ON, single-step chain `[Anthropic]` (remote, no embeddings, no fallback), `embed` call. Gate trips at the only step; surfaces lockdown error; the embed re-route is never attempted (verify the `findLocalEmbeddings` helper is **not called** via spy). (2) Same call but `containsVaultContent: false`: gate doesn't trip → re-route fires → routes to whichever local-embeddings provider exists, or throws `'unsupported'` retryable if none. Verifies L2 from [contracts/router.md](contracts/router.md): re-route runs AFTER the gate at each step, so a blocked step never reaches the re-route logic. (3) `containsVaultContent: true`, lockdown ON, chain `[Anthropic → OllamaLocal]` (remote then local-with-embeddings). Gate trips on Anthropic, skips to OllamaLocal (per the per-step semantics from C1), OllamaLocal's `embed` serves — verifying that the per-step "skip" path still composes correctly with the embed re-route at the new step (here the re-route is a no-op because OllamaLocal already has embeddings).

### Settings UI fallback editor

- [X] T070 [US3] Extend [src/features/settings/ai/RoleRoutingEditor.tsx](../../src/features/settings/ai/RoleRoutingEditor.tsx) with the fallback editor per [contracts/ui-settings.md](contracts/ui-settings.md): "+ Add fallback" button per role row → opens a provider+model selector → appends a `RoleTarget` to the chain. Each fallback step is visually nested under the primary, with its own "Remove" button. `useAIConfig.addFallback(role, providerId, model)` and `useAIConfig.removeFallback(role, index)` orchestrate the saves.
- [X] T071 [P] [US3] Vitest jsdom tests for `RoleRoutingEditor` fallback in `src/features/settings/ai/RoleRoutingEditor.fallback.test.tsx`: Add fallback → chain renders in order; Remove fallback at index N → chain truncates correctly; save → `config.routing[role]` reflects the chain exactly.
- [X] T072 [P] [US3] Vitest jsdom test for stale-reference auto-truncate in `src/features/settings/ai/RoleRoutingEditor.stale.test.tsx`: a fallback chain pointing at a provider that was subsequently removed surfaces a warning + the chain auto-truncates to the step before the missing provider on the next save.

**Checkpoint US3**: Fallback chains configurable end-to-end via UI; router walks the chain on retryable errors; embed re-route is privacy-preserving (runs after lockdown gate). The user-visible fallback experience requires an AI consumer (017+).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates, documentation reconciliation, accessibility, and the live `tauri dev` verification.

- [X] T073 [P] Stress test for key redaction (SC-004) in `src/ai/redaction.stress.test.ts`: simulate 100 provider calls across all three adapters spanning success / `auth` / `rate_limit` / `timeout` / `offline` / `cancelled` / `bad_response` / `unknown`. After each call, assert: no captured log line contains the test secret; `JSON.stringify(thrown)` contains neither the secret nor an `Authorization` / `x-api-key` value; the secret is not reachable from any `Object.values(adapter)` traversal.
- [X] T073a [P] **Architectural-boundary assertion test** for FR-024 + FR-025 in `src/ai/boundary.test.ts` (`@vitest-environment node`): walks the file tree under `src/` excluding `src/ai/adapters/**` and `src/ai/testing/**`; for each `.ts`/`.tsx` file, parses the import statements (regex match on `import …from '…'` + `from "…"`) and asserts NONE of them resolve to: (a) an adapter class export (`OllamaAdapter` / `OpenAICompatibleAdapter` / `AnthropicAdapter` / `TauriKeychainSecretStore`) — features must depend on the spine interfaces, never on concrete adapter classes; (b) a path under `src/ai/adapters/` (any nested file). The ESLint `no-restricted-imports` rule already blocks the vendor SDKs; this test asserts the same boundary at runtime for our own adapter classes (which ESLint can't easily express via package-name matches). Covers FR-024 ("vendor specifics in one directory") and FR-025 ("single routing chokepoint; no feature instantiates an adapter") with a regression-proof assertion.
- [X] T074 [P] Keyboard navigation pass for AISection (SC-008) in `src/features/settings/ai/AISection.keyboard.test.tsx` (jsdom + `userEvent.keyboard`): Tab / Shift+Tab cycles through all interactive elements in document order; Enter on "Add provider" opens the form; Tab traverses the form fields without skipping the password show/hide toggle; Enter on Save submits; Escape on the form cancels (where applicable). End-to-end: complete a provider add → key paste → role assignment → lockdown toggle → save using ONLY keyboard input.
- [X] T075 [P] Reconcile [ai-provider-layer.md](../../ai-provider-layer.md) with the as-built implementation if any drift surfaced during build. Anticipated: zero diffs (the design doc was hardened in-session and the contracts directly mirror it). Update the doc's "Last reviewed" date if any change.
- [X] T076 [P] Update [PRD-CIC-Platform.md](../../PRD-CIC-Platform.md) §10 + §12: reconcile any phrasing drift from the implementation; bump PRD version to 0.9.11 with a changelog entry citing Feature 016.
- [X] T077 [P] Update [CLAUDE.md](../../CLAUDE.md) inside the `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` block: change the Active feature stanza from "PLANNED" to "implemented", record the final test count (387 baseline + the new tests), summarize the build (no SQLite migration, one Cargo dep, no new npm dep, the spine layout, the four spine + three deep + one composition root + one settings section, the 100-call redaction proof). Demote 015 from "Prior feature" position (already there) and advance "Next" to F10.2 RAG ingestion.
- [X] T078 Quality gate — run from the repo root, all must pass before marking the feature complete:
  - `npm run lint` (ESLint clean, including the vendor-import rule).
  - `npm test` (387 baseline + this feature's new tests all green).
  - `npm run build` (tsc strict + vite build, no errors).
  - `cd src-tauri && cargo check` (the `keyring` crate compiles per target).
- [ ] T079 Live `tauri dev` quickstart — user-driven verification of [quickstart.md](quickstart.md) scenarios A–J. The user runs `npm run tauri dev`, walks each scenario, and reports back. Holds the end-of-feature commit until cleared.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies. Start immediately.
- **Phase 2 (Foundational)** — depends on Phase 1. **BLOCKS all user stories.** Internal ordering within Phase 2:
  - 2.1 types (T005–T007) → 2.2 classification (T008–T009) → 2.3 config (T010–T011) — types depend on each other.
  - 2.4 secrets (T012–T016) — `SecretStore` interface (T012) before the Rust + TS impl tasks.
  - 2.5 streaming parsers (T017–T020) — independent of secrets; can run alongside 2.4.
  - 2.6 contract harness (T021–T023) — depends on 2.5 (uses ReadableStream + the parsers don't, but `fakeFetch` returns streams).
  - 2.7 composition root (T024–T027) — depends on 2.1 + 2.3 + 2.4 (uses Provider, AIConfig, SecretStore).
  - 2.8 settings scaffold (T028–T030) — depends on 2.7 (uses `useAIRouter`).
- **Phase 3 (US1)** — depends on Phase 2 complete. Internal: router (T031–T034) before OllamaAdapter (T035–T038) before Settings UI (T039–T048).
- **Phase 4 (US2)** — depends on Phase 2 complete. Independent of US1's router and Settings UI tasks (parallel-able if staffed). T049–T054 (adapters) before T055–T064 (UI extensions).
- **Phase 5 (US3)** — depends on Phase 3 router (T031). Independent of US2's UI extensions.
- **Phase 6 (Polish)** — depends on all of Phase 3 + 4 + 5 complete. T078 + T079 are the final gates.

### Within each user story

- Tests are co-located with implementation by step (not strict TDD). Each adapter task ships with its contract-suite registration in the same commit.
- The Pocock build order is enforced WITHIN Phase 2 (types → secrets → contract harness → composition root). Adapters can only be implemented once the spine + harness are done.

### Parallel opportunities

- All Phase 1 tasks (T002–T004) parallel after T001.
- Within Phase 2: many [P]-tagged Vitest test files can be written in parallel with each other (they touch separate files). The implementation files have ordering as noted above.
- US1 router-policy tests (T032–T034) all parallel.
- US1 Settings UI tests (T044–T048) all parallel.
- US2 adapter contract tests (T051, T054) parallel.
- US2 Settings UI tests (T060–T064) all parallel.
- US3 router tests (T067–T069) all parallel.
- US3 Settings UI tests (T071–T072) parallel.
- Phase 6: T073–T077 all parallel; T078 + T079 sequential at the end.

---

## Parallel Example: Phase 2 Foundational (Spine + Harness)

```bash
# After T005 lands, the following can be written in parallel by different tasks:
Task: T006 [P] Implement src/ai/errors.ts (spine).
Task: T008 [P] Implement src/ai/classification.ts.
Task: T012 [P] Implement src/ai/secrets.ts + InMemorySecretStore.
Task: T017 [P] Implement src/ai/adapters/sse.ts.
Task: T019 [P] Implement src/ai/adapters/ndjson.ts.

# And the test files alongside them:
Task: T007 [P] Vitest tests for src/ai/errors.ts.
Task: T009 [P] Vitest tests for src/ai/classification.ts.
Task: T013 [P] Vitest tests for InMemorySecretStore.
Task: T018 [P] Vitest tests for sse.ts.
Task: T020 [P] Vitest tests for ndjson.ts.
```

## Parallel Example: User Story 1 Settings UI

```bash
# After T039 + T040 + T041 + T042 land, the tests can be written in parallel:
Task: T044 [P] [US1] ProviderForm test (ollama type).
Task: T045 [P] [US1] ProviderList test (Test connection + Remove).
Task: T046 [P] [US1] RoleRoutingEditor test (primary-only).
Task: T047 [P] [US1] LockdownToggle test.
Task: T048 [P] [US1] AISection end-to-end test (US1 happy path).
```

---

## Implementation Strategy

### MVP First — User Story 1 only

1. Complete Phase 1: Setup (T001–T004).
2. Complete Phase 2: Foundational (T005–T030) — **CRITICAL, blocks all stories.**
3. Complete Phase 3: US1 (T031–T048).
4. **STOP and VALIDATE**: live `tauri dev` quickstart Scenarios A + E + F + I. With Ollama running, the app's `/settings` AI section is fully functional for local providers.
5. With US1 alone, the project has a usable, *fully-local-only* AI infrastructure. Future AI features could begin (limited to Ollama).

### Incremental delivery (recommended for the mega-feature)

Because this feature ships everything in one PR (explicit user decision), do not pause at the MVP — proceed through all phases before committing:

1. Setup + Foundational → spine ready.
2. US1 → local Ollama works end-to-end.
3. US2 → remote providers + key storage + lockdown reflection.
4. US3 → fallback chains.
5. Polish (T073–T077 in parallel; T078 quality gate; T079 user-driven live quickstart).
6. Commit + push + PR + rebase-merge to `main` (matches the 012–015 pattern).

### Parallel team strategy (single developer running multiple tasks)

Even with one developer, the `[P]` markers allow batching unrelated edits — e.g., write all of T006/T008/T012/T017/T019 + their tests in one work session before moving on. The Foundational phase has the most parallelism.

---

## Notes

- **No SQLite migration.** Reuses the `settings` table from `m0002`. The migration test bump pattern (4 version-pinned tests) does NOT apply.
- **No new npm dependency.** Plain `fetch` + native `ReadableStream` + ~60 LOC of inline streaming parsers. The existing `zod` covers config validation.
- **One Rust dependency**: `keyring = "3"`. Custom command pattern (mirrors 011). No new Tauri plugin → no new capability permission.
- **ESLint boundary already wired** for `src/ai/adapters/*` (lines 34–36 of `eslint.config.js`). No rule changes.
- **Constitution II is the design**: every guardrail (no SDK leakage, router chokepoint, lockdown gate, secrets in keychain, redaction) corresponds to a specific contract + tests in this list.
- **`containsVaultContent` is REQUIRED on every AI call** — enforced by the type system in T005. Tests in T032 and T067 verify the lockdown gate respects it on `chat` AND `embed`.
- **The build order in research R10 is normative** — this file follows it exactly. The phase boundaries map: Phase 2 = §11 steps 1–3 + composition root + UI scaffold; US1 = §11 step 3 (Ollama) + the routing-only slice of step 6 (router); US2 = §11 steps 4 (OpenAI-compat) + 5 (Anthropic) + the UI extensions; US3 = the fallback-walk + embed re-route slices of §11 step 6 + the fallback UI; Polish = §11 step 7's stragglers + quality gates.
- **Hold the end-of-feature commit until T079 (live quickstart) clears**, per the 012–015 pattern. Once cleared: Conventional Commit + `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer; stage specific files (TS + Cargo.toml + `src-tauri/src/lib.rs` + capabilities file if changed + specs + PRD + CLAUDE.md); push; PR; rebase-merge to `main`.
