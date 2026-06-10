# Implementation Plan: AI Provider Layer

**Branch**: `016-ai-provider-layer` | **Date**: 2026-05-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/016-ai-provider-layer/spec.md](spec.md)

## Summary

The CIC AI spine. One PR ships the **vendor-agnostic Provider abstraction** (Constitution II) — types/errors/config/secrets/router + three adapters (Ollama / OpenAI-compatible / Anthropic) + a `/settings` AI section — with **no AI consumer yet**. Subsequent Phase 3 features (RAG ingestion, the F4 tutor, F10 generation, the F6 scheduler) consume this layer; they cannot ship before it.

Technical approach (from research, [research.md](research.md)):

- **Spine** (small, abstraction-only): `src/ai/{provider,errors,config,secrets,router}.ts`. Wide barrels are smells; spine files stay tight.
- **Deep modules** (the only place vendor specifics may live): `src/ai/adapters/{ollama,openai-compatible,anthropic}.ts` + `src/ai/adapters/secrets/tauri.ts`. ESLint `no-restricted-imports` (already wired) enforces the boundary.
- **Streaming**: native `fetch().body` (`ReadableStream<Uint8Array>`) parsed inline — tiny SSE parser for OpenAI-compatible/Anthropic, tiny NDJSON parser for Ollama. No SDK, no `eventsource-parser` dep.
- **Secrets**: a custom Rust command in `src-tauri/src/lib.rs` wrapping `keyring-rs` (active, native OS credential APIs — Windows Credential Manager / macOS Keychain / Linux libsecret). Mirrors how 011 added a per-feature Rust command for source-file internalization.
- **Persistence**: AIConfig stored as a JSON string in the existing `settings` table (m0002), key `ai.config`, zod-validated on every read. No new SQLite migration; the table has been there since Phase 1.
- **Lockdown chokepoint**: lives in the router, runs identically on `chat` AND `embed`, gates on `containsVaultContent && config.lockdown && !provider.capabilities().isLocal` — non-retryable error, never silently falls through.
- **Composition root**: a new React `AIProvider` mirroring `DbProvider`/`VaultProvider` — loads config from SQLite + instantiates adapters + wires the router. `useAIRouter()` is the only consumption surface.
- **Settings host**: extend [SettingsRoute.tsx](../../src/app/routes/settings/SettingsRoute.tsx) (014's `/settings` page) with a new AI section parallel to Notifications. Mirrors the 014 pattern (hook + section + DI-injected seam for tests).

## Technical Context

**Language/Version**: TypeScript (strict, no `any`) on the existing Vite + React 19 frontend; Rust 2021 in `src-tauri/` for the keychain command (tiny, ~30 LOC).

**Primary Dependencies**:
- *Existing*: `@tauri-apps/api` (for `invoke`), `zod` (validation), `react-router-dom` (settings route), `tauri-plugin-sql` (settings table). No direct vault FS use — config lives in SQLite.
- *New (Rust)*: `keyring = "3"` — native OS credential store. Active, used by `cargo` itself.
- *New (TypeScript)*: **none**. Plain `fetch` + native `ReadableStream`. No vendor SDKs (the ESLint rule would block them anyway). No SSE parser dep — ~30 LOC handwritten.

**Storage**:
- AIConfig JSON blob → SQLite `settings(key='ai.config')` (reuses m0002, no migration).
- API keys → OS keychain via the keychain command. Config holds only opaque references (`apiKeyRef`), never the secret.

**Testing**:
- Vitest with the existing node-environment (`// @vitest-environment node`) for adapter contract tests, router tests, config zod tests, secret-redaction tests.
- jsdom for the settings UI tests (`renderApp`/`renderWithVault` helpers from 014).
- Adapter contract tests inject a fake `fetch` (no MSW dep) that returns a streaming `Response` with controllable bytes for chat (SSE/NDJSON), embeddings (JSON), and error paths. Production adapters use `globalThis.fetch`.

**Target Platform**: Tauri 2 desktop (Windows / macOS / Linux). The keychain command compiles per-target via `keyring-rs`'s built-in feature flags. Webview-fetch handles HTTP.

**Project Type**: Desktop app, single project. No backend service; no schema delta.

**Performance Goals**:
- Streaming first-chunk latency dominated by the provider, not the layer — the layer must not buffer the whole response (i.e., yield each parsed chunk as soon as the underlying stream emits it).
- Probe round-trip (`/api/tags` for Ollama, `GET /v1/models` for OpenAI-compatible, a minimal `messages` request for Anthropic) under ~5 s on a working endpoint; under ~10 s to error decisively on a broken one (SC-006).
- AIConfig load on app boot under 50 ms (one SQLite row, JSON.parse, zod-validate).

**Constraints**:
- **Constitution II (NON-NEGOTIABLE)**: vendor specifics live ONLY in `src/ai/adapters/*`. Enforced by ESLint and by the spine's abstraction-only types.
- **Constitution II**: secrets live in the OS keychain, never in the vault, never logged, never in plaintext config. `containsVaultContent: true` calls never log request/response bodies (even on error).
- **Constitution II**: the router IS the chokepoint. No feature instantiates an adapter. `containsVaultContent` is required on every `chat`/`embed` call — no safe default.
- **Constitution IV**: interface-first deep modules. The five spine files (`provider`/`errors`/`config`/`secrets`/`router`) export thin, vendor-neutral abstractions; concrete implementations live behind them.
- **No vault writes**, no vault reads, no SQLite schema change. (Reused: `settings` table from m0002.)
- **Fully local default**: out of the box the app makes no outbound calls; only after the learner configures a remote provider does it reach a remote endpoint.

**Scale/Scope**:
- Per-user single-machine, in the hundreds of bytes of config (≤ ~5 providers typical).
- Fallback chain depth: practical limit ~3 (UI surfaces, but no hard cap).
- Three adapters at ship time; the architecture supports adding a fourth in one new file (SC-007).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|---|---|---|
| **I. Vault Sacred (NON-NEGOTIABLE)** | ✅ N/A | Feature touches no vault. No `.md` writes, no marker contract, no vault reads. |
| **II. AI Vendor-Agnostic (NON-NEGOTIABLE)** | ✅ This feature IS the implementation. | ESLint `no-restricted-imports` already wired for `openai` / `@anthropic-ai/sdk` ([eslint.config.js:34-36](../../eslint.config.js#L34-L36)); we keep it as-is (we won't actually import either SDK — plain fetch suffices — but the dormant rule remains the gate for any future SDK import). The router is the single chokepoint; `containsVaultContent` is required on `ChatOptions` and `EmbedOptions`; lockdown gates both `chat` and `embed`; secrets via OS keychain; redaction enforced. |
| **III. Desirable Difficulty (NON-NEGOTIABLE)** | ✅ N/A | No learning surface in this feature. Future AI consumers must honor it; this feature ships no consumer. |
| **IV. Interface-First Deep Modules (Pocock)** | ✅ Built around it. | Spine: `src/ai/{provider,errors,config,secrets,router}.ts` (small, types-only). Deep: `src/ai/adapters/*` + the Tauri keychain `SecretStore` impl. Composition root: `src/app/providers/AIProvider.tsx`. Features will import `router.ts` types and the `useAIRouter()` hook, never an adapter. |
| **V. Spec-Driven Development** | ✅ Spec → plan → tasks → implement. | Full Phase 1 doc set (research + data-model + 6 contracts + quickstart). The canonical implementation contract [ai-provider-layer.md](../../ai-provider-layer.md) (root of repo) governs HOW; PRD §10 governs WHAT; both honored. |

**Locked-tech reconciliation:**
- New Cargo dependency: `keyring = "3"`. Per Constitution V (locked technologies) this is a deep module — the OS keychain is the storage backing for `SecretStore`. Same pattern as 014's `notify-rust`/notification-plugin dep — `src-tauri/` change is legitimate.
- No new TS dependency. (No SDKs, no SSE parser library, no HTTP client.)
- New Tauri capability permission: not needed for the custom command (the command itself is the boundary, like 011's source-file commands). No new plugin = no new `*:default` permission.

**No violations. Constitution check passes.** Complexity Tracking section below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/016-ai-provider-layer/
├── plan.md                          # This file
├── research.md                      # Phase 0: 10 decisions locked
├── data-model.md                    # Phase 1: entity model + zod validation
├── quickstart.md                    # Phase 1: live tauri dev scenarios A–J
├── contracts/
│   ├── provider-interface.md        # Provider + ChatOptions/EmbedResult/Capabilities + ProviderType
│   ├── errors.md                    # ProviderError taxonomy + retryability rules
│   ├── config.md                    # AIConfig zod schema + load/save + role/fallback semantics
│   ├── secrets.md                   # SecretStore interface + Tauri keychain adapter contract
│   ├── router.md                    # AIRouter: lockdown gate + fallback walk + embed re-route + probe
│   ├── adapter-contract.md          # Shared adapter invariants + fake-fetch test harness
│   └── ui-settings.md               # AI Providers / Routing / Lockdown panels contract
└── tasks.md                         # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── ai/                              # NEW — the AI spine + deep adapters
│   ├── provider.ts                  # SPINE: Provider interface + ChatMessage/ChatOptions/ChatChunk/
│   │                                #        EmbedResult/EmbedOptions/ProviderCapabilities/ProviderType
│   ├── errors.ts                    # SPINE: ProviderError class + ProviderErrorKind union + isRetryable
│   ├── config.ts                    # SPINE: AIConfig zod schema + AIRole/ProviderConfig/RoleTarget +
│   │                                #        loadAIConfig(db) / saveAIConfig(db, config) over settings KV
│   ├── secrets.ts                   # SPINE: SecretStore interface (set/get/delete)
│   ├── router.ts                    # SPINE: AIRouter interface (chat/embed/probe)
│   ├── classification.ts            # SPINE-adjacent: isLocalHost(baseUrl) helper, pure
│   ├── routerImpl.ts                # DEEP: defaultRouter — lockdown gate + fallback walk + re-route + probe cache
│   ├── adapters/                    # ⚠ ONLY place vendor specifics + keychain may live (ESLint boundary)
│   │   ├── index.ts                 # createProvider(config: ProviderConfig, secrets: SecretStore): Provider
│   │   ├── ollama.ts                # NDJSON stream over POST /api/chat + POST /api/embeddings
│   │   ├── openai-compatible.ts     # SSE stream over POST /v1/chat/completions + POST /v1/embeddings
│   │   ├── anthropic.ts             # SSE stream over POST /v1/messages; system as top-level field
│   │   ├── sse.ts                   # Tiny SSE parser (data: line splitter) — private to adapters
│   │   ├── ndjson.ts                # Tiny NDJSON parser — private to adapters
│   │   └── secrets/
│   │       └── tauri.ts             # Tauri keychain SecretStore impl — only @tauri-apps/api importer for secrets
│   └── testing/
│       ├── contract.ts              # Adapter contract suite: streaming, error mapping, AbortSignal
│       └── fakeFetch.ts             # Fake `fetch` builder for streaming Responses + error responses
├── app/
│   └── providers/
│       └── AIProvider.tsx           # NEW: composition root — loads AIConfig + instantiates adapters + router
└── features/
    └── settings/                    # NEW — the AI section's React surface
        └── ai/
            ├── AISection.tsx        # Mounted inside SettingsRoute alongside NotificationsSettings
            ├── ProviderForm.tsx     # Add / edit a ProviderConfig (kind-driven fields)
            ├── ProviderList.tsx     # Configured providers + "Test connection"
            ├── RoleRoutingEditor.tsx # Three roles × (provider/model) + fallback chain editor
            ├── LockdownToggle.tsx   # Global lockdown switch + explainer
            ├── useAIConfig.ts       # CRUD over AIConfig + secrets + probe
            └── *.test.tsx           # Vitest + jsdom UI tests with a fake AIProvider

src-tauri/
├── Cargo.toml                       # +keyring = "3"
├── capabilities/default.json        # (no new permission — the keychain is exposed via the custom command)
└── src/lib.rs                       # +ai_keychain_{set,get,delete} commands (≈30 LOC, mirrors 011's pattern)
```

**Structure Decision**: Single-project layout (existing). The new code adds the `src/ai/` tree (spine + adapters + testing helpers), one composition-root React provider, one Settings UI section, and one tiny Rust command in `src-tauri/src/lib.rs` (plus the `keyring` Cargo dep). No new SQLite migration. No vault path touched.

**Spine-adjacency note** (Constitution IV alignment): the Constitution IV §"CIC spine" enumeration explicitly lists `provider.ts` / `errors.ts` / `router.ts` / `config.ts` / `secrets.ts` as the five spine files. This feature adds `classification.ts` as a pure helper (`isLocalHost` + `isLanHost` — no dependencies, no React, no imports beyond the standard URL parser). It is treated as **spine-adjacent** — too small and dependency-free to be a deep module, but not strictly named in the Constitution's spine enumeration. No constitutional amendment is needed; future readers should treat `classification.ts` as part of the spine in spirit. If a future feature introduces a similarly pure helper, the same precedent applies.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CORS blocks a remote vendor's API from the Tauri webview (Anthropic / OpenRouter / OpenAI) | Low — all three publish CORS-friendly headers | High (the remote adapter would be unusable) | Quickstart Scenarios B/J verify live. If a vendor blocks CORS, fallback is `@tauri-apps/plugin-http` (not pulled in v1). Documented in research R2. |
| `keyring-rs` headless / CI-machine failure (no credential daemon) | Low — desktop product, but possible on a headless dev VM | Medium (keychain ops fail) | Spec edge-case + research R1: surface a clear error, refuse to persist a secret in cleartext, providers without secrets (Ollama) still work. |
| Streaming + AbortSignal subtle bugs (orphaned promises, unhandled rejections) | Medium — easy to get wrong | High (memory / unhandled-rejection noise) | Adapter contract test suite includes a cancellation test for every adapter (FR-022, SC-009). Pattern: pass `signal` to `fetch`, translate `AbortError` → `ProviderError('cancelled', …)`. |
| Lockdown gate bypassed by a future feature wiring up its own fetch path | Medium — temptation real | High (privacy leak) | Constitution II is non-negotiable; ESLint rule blocks vendor SDK imports outside `src/ai/adapters/*`; spec FR-024/FR-025 are testable invariants; the chokepoint is the only routed call path. PR review checks this on every feature consuming the layer. |
| Probe caching surfaces stale results when the user changes the endpoint | Low — config save invalidates the cache | Low (a click of "Test connection" clears it) | Probe cache keyed by `(providerId, baseUrl)`; config save bumps a version key. Re-probe on first save (per ai-provider-layer.md §7). |
| API keys leak via error messages or stack traces | Low — adapters never include the secret in `ProviderError.cause` | High (key disclosure) | SC-004 in spec: 100-call simulation, zero leaks. Test asserts log captures and `JSON.stringify(err)` contain neither the key nor any header containing it. Adapters fetch the key inside the call, never store it on the instance. |
| SSE / NDJSON parser bug truncates the stream | Medium — hand-rolled parsers can have edge cases | Medium | Contract test suite includes partial-chunk delivery (the same payload split across `pull()` boundaries in 1, 7, and 100-byte slices) per adapter. |
| Ollama not running when the user clicks "Test connection" | High — expected user state | Low (clear error) | Adapter translates `ECONNREFUSED` → `ProviderError('offline', …)` with the message "couldn't reach Ollama at <baseUrl> — is it running?". Quickstart Scenario A.3 verifies. |
| The settings UI tests are flaky because `AIProvider` does network I/O on mount | Medium — common React-provider trap | Low (test maintenance) | `AIProvider` accepts an injected `createProvider`/`SecretStore` factory (DI) so tests get a fake; matches the 014 `Notifier`/`SourceFiles` pattern. Production wiring lives in `app/main.tsx`. |

## Complexity Tracking

> Empty — Constitution Check passes with no violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|

## Next Phases

- **Phase 2 — Tasks** (`/speckit-tasks`): decompose into atomic, ordered tasks following ai-provider-layer.md §11 build order (Types → Errors → Config → Secrets → Ollama → OpenAI-compatible → Anthropic → Router → Settings UI). Estimate ~50–60 tasks.
- **Phase 3 — Analyze** (`/speckit-analyze`): consistency check across spec + plan + tasks before implementation.
- **Phase 4 — Implement** (`/speckit-implement`): TDD-friendly per the build order, contract tests at each adapter, gate on tsc + ESLint + `vite build` + `cargo check` + ≥414 tests passing (387 baseline + new).

The next AI consumer (likely F10.2 RAG ingestion or F4 tutor) lands in 017 and consumes `router.embed`/`router.chat`. Per Constitution IV, that consuming feature must not import anything from `src/ai/adapters/*` — only `useAIRouter()` and the spine types.
