# CIC — Development Handover

> **Audience:** the next agent/LLM picking up CIC development.
> **Written:** 2026-06-02, end of the Feature 016 live-quickstart debugging session.
> **Status of this file:** transient onboarding note. Do **not** stage it in the Feature 016 commit; delete it once you're oriented.

---

## 0. TL;DR — the baton, right now

- **Active branch:** `016-ai-provider-layer` (NOT merged; NOTHING committed this session).
- **Feature 016 (AI Provider Layer) is code-complete and green** — `558` tests pass, `tsc` + ESLint + `vite build` + `cargo check` all clean.
- It is **uncommitted on purpose.** Per the project's per-feature rule, the commit is **held until the user finishes the live `tauri dev` quickstart (scenarios A–J) and explicitly authorizes**. See §6.
- **Quickstart progress:** Scenario **A** (local provider) ✅ passed; Scenario **E** (role routing) ✅ just fixed. **B, C, D, F, G, H, I, J still need the user to walk them.** See §5.
- **Your immediate job:** support the user through the remaining quickstart scenarios, fix anything they surface (the way we fixed A and E), then — **only on their go-ahead** — commit 016, push, open a PR, and rebase-merge to `main`. After that: **Feature 017 = F10.2 RAG ingestion** (§7), the first real consumer of this layer.

---

## 1. What CIC is (read the real docs)

A **fully-local, Obsidian-reliant, AI-powered personal learning platform** (Tauri 2 + React 19 + TypeScript-strict + Vite + SQLite). Built spec-first via GitHub spec-kit (Specify → Plan → Tasks → Analyze → Implement).

**Source-of-truth documents — read these before doing anything substantive:**
- [`PRD-CIC-Platform.md`](PRD-CIC-Platform.md) — authoritative product spec. The PRD wins over everything else; flag conflicts, don't resolve them silently.
- [`CLAUDE.md`](CLAUDE.md) — guardrails + quick reference + the live "Current focus" / SPECKIT block (always read in full at session start).
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — the 5 governing principles (I Vault Sacred, II AI Vendor-Agnostic, III Preserve Desirable Difficulty — all NON-NEGOTIABLE; IV Interface-First Deep Modules; V Spec-Driven).
- [`ai-provider-layer.md`](ai-provider-layer.md) — the canonical *how* contract for the AI layer (PRD §10 governs *what*).
- `specs/016-ai-provider-layer/` — the full spec set for the current feature (spec/plan/research/data-model/contracts/quickstart/tasks).

The user is a developer building a portfolio project to move into a PM/product-engineer role. **Teach the "why," flag senior-review concerns proactively, explain trade-offs.** They own all git decisions and run the live verification themselves.

---

## 2. Non-negotiable guardrails (Constitution — memorize)

1. **Fully local.** No cloud, no backend, no telemetry. The *only* outbound calls are user-configured AI providers — and even those must be blockable by the lockdown flag.
2. **Vault is sacred.** All knowledge is plain Markdown in the user's Obsidian vault. Only `VaultReader`/`VaultWriter` touch `.md`. Atomic writes, never clobber, no binaries in the vault.
3. **AI is vendor-agnostic.** Vendor SDKs / HTTP specifics may be imported **only** inside `src/ai/adapters/*`. Everything else depends on the abstraction (`Provider`/`AIRouter`). Enforced by ESLint `no-restricted-imports` **and** the runtime `src/ai/boundary.test.ts`.
4. **Scaffold-by-default for generation; tutor-not-oracle; preserve desirable difficulty.** Don't add features that smooth away retrieval/spacing/interleaving. AI never auto-commits notes/cards/courses — user reviews first.
5. **Secrets stay local** (OS keychain only — never vault, never logged, never plaintext config).
6. **Lockdown chokepoint:** any path that could send vault content to a non-local endpoint must pass through the single router gate. (`src/ai/routerImpl.ts`.)

If a task seems to require breaking one of these, **stop and ask.**

---

## 3. Process rules (how this repo is run — important)

- **Spec-kit flow** for features: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`. Full Phase-1 doc set by default.
- **The user owns git timing.** You may run `git status/diff/log/add/commit/branch/checkout/push` as part of the normal flow, but: stage **specific files** (never `git add -A`), use Conventional Commits, add the `Co-Authored-By: Claude` trailer, **never commit secrets**, and **confirm before destructive ops** (force-push, `reset --hard`, history rewrites, branch/tag deletion).
- **Per-feature commit discipline (critical):** implement → deliver a **mandatory end-of-feature walkthrough** → **HOLD the commit** until the user runs the live `tauri dev` quickstart and explicitly authorizes → only then commit → push → open PR → **rebase-merge to `main`** (this is how 012–015 shipped).
- **Live `tauri dev` is the user's check.** jsdom/Vitest can't catch Tauri-runtime issues (CORS, capability scope, keychain) — those only show up live, which is exactly what this session's bugs were.

---

## 4. Feature 016 — what shipped + the six live-surfaced fixes

**016 = the vendor-agnostic AI spine**, PRD §10, the first Phase-3 feature. Types + errors + config + secrets + 3 adapters (Ollama / OpenAI-compatible / Anthropic) + router + a `/settings` AI section, in one PR. **No AI consumer yet** — it ships the *layer*; 017+ consume it.

**Architecture (Pocock interface-first / deep modules):**
- **Spine** (small, abstraction-only): `src/ai/{provider,errors,config,secrets,router}.ts` + spine-adjacent `classification.ts` (`isLocalHost`/`isLanHost`).
- **Deep** (implementations, ESLint-confined): `src/ai/adapters/{ollama,openai-compatible,anthropic,sse,ndjson,tauriFetch}.ts` + `adapters/secrets/tauri.ts` + `src/ai/routerImpl.ts`.
- **Composition root:** `src/app/providers/AIProvider.tsx` — builds the adapter map, injects `tauriFetch` (native HTTP) + the keychain `SecretStore`, exposes `useAIRouter()`. Features only ever see `useAIRouter()`; adapter classes are never imported outside `src/ai/adapters/**` (asserted by `src/ai/boundary.test.ts`).
- **Settings UI:** `src/features/settings/ai/` — `AISection`, `ProviderForm`, `ProviderList`, `RoleRoutingEditor`, `LockdownToggle`, `useAIConfig`.
- **Persistence:** `AIConfig` is a JSON blob in the existing `settings` table under key `ai.config`, zod-validated on every load **and** save. **No SQLite migration.**
- **Secrets:** Rust `keyring = "3"` wrapped by custom commands `ai_keychain_{set,get,delete}` (service `cic.ai.providers`, username = provider id) in `src-tauri/src/lib.rs`. Only `src/ai/adapters/secrets/tauri.ts` invokes them.
- **Lockdown:** the router is the single chokepoint, and the gate runs at **every step** of the fallback walk (the "C1" privacy fix), per Constitution II.

**The six things fixed live this session (all were invisible to unit tests — they were Tauri-runtime / UX issues):**

1. **`router.probe()` was a no-op.** It returned static capabilities with no network call, so "Test connection" never tested anything. → Added a real `probe()` to the `Provider` interface returning `ProbeOutcome` (caps + `latencyMs`): Ollama `GET /api/tags`, OpenAI-compat `GET /v1/models`, Anthropic 1-token POST. Contract-tested (A12/A13/A14). `src/ai/provider.ts`, `router.ts`, `routerImpl.ts`, all 3 adapters, `testing/contract.ts`, `ProviderList.tsx`.

2. **OpenAI-compatible wrongly required an API key.** Local servers (LM Studio/llama.cpp/vLLM) are keyless. → Key is now optional for `openai-compatible`. `useAIConfig.ts` / `ProviderForm.tsx` / adapter `buildHeaders`.

3. **WebView2 CORS blocked all provider HTTP** (the big one). The webview `fetch` enforces CORS; local LLM servers send no `Access-Control-Allow-Origin`, so responses were blocked and mislabeled `offline`. → Route every adapter call through **`@tauri-apps/plugin-http`** (npm `2.5.9`, Cargo `tauri-plugin-http` with the **`unsafe-headers`** feature — REQUIRED so Anthropic's `x-api-key`/`anthropic-version` aren't dropped), which runs the request natively in Rust (no CORS) and still streams. Injected as each adapter's `fetchFn` at the composition root via the lazy, boundary-confined seam `src/ai/adapters/tauriFetch.ts`. **This reverses the original 016/research.md R2 "plain fetch" decision** — R2 was updated with the evidence (an 8-agent research + adversarial-verification workflow). ESLint now confines `@tauri-apps/plugin-http` to `src/ai/adapters/*`.

4. **Capability scope used invalid glob.** `http://**` is not valid URLPattern syntax → every request was scope-rejected *before* hitting the network (the server logged nothing). → Fixed `src-tauri/capabilities/default.json` to `http://*:*`, `http://*`, `https://*:*`, `https://*` (the `:*` allows any port — essential for `:1234`/`:11434`). Scope is broad **by necessity** (arbitrary user-configured providers); the **router stays the authoritative lockdown chokepoint**, the scope is coarse defense-in-depth.

5. **Adapters masked the real error.** `translateNetworkError` discarded the underlying cause, so a scope rejection looked like a generic `offline`. → All 3 adapters now append the real cause: `couldn't reach <url> (<reason>)` + attach it as the error `cause` (verified secret-safe by the 100-call redaction stress test).

6. **Role-routing dropdown + model field broken** (Scenario E). The step editor was fully controlled by persisted config; selecting a provider tried to persist an empty `model`, which fails `RoleTargetSchema.model = z.string().min(1)` → the save threw and was silently swallowed → the dropdown "stuck" on "— none —"; and the model input reset on every keystroke. → Gave the step editor **local state** + default-model prefill + commit only complete targets (on blur/Enter). `src/features/settings/ai/RoleRoutingEditor.tsx` + new `RoleRoutingEditor.test.tsx` (3 regression tests).

---

## 5. Quickstart status (the user's live check) — [`specs/016-ai-provider-layer/quickstart.md`](specs/016-ai-provider-layer/quickstart.md)

| Scenario | What it exercises | Status |
|---|---|---|
| A | Add a local provider (Ollama / LM Studio / llama.cpp), Test connection | ✅ **Passed** (both LM Studio + llama.cpp as OpenAI-compatible) |
| B | Add a remote provider (Anthropic / OpenRouter) with a **real key** | ⏳ pending — will exercise `unsafe-headers` + keychain write |
| C | Verify the key is in the **OS keychain** (service `cic.ai.providers`) and **NOT** in `SELECT value FROM settings WHERE key='ai.config'` | ⏳ pending |
| D | Local/remote classification badges (local / remote (LAN) / remote) | ⏳ pending |
| E | **Role routing** (assign reasoning/drafting/embeddings) | ✅ **Just fixed** — re-verify on the user's side |
| F | **Lockdown** toggle — remote steps blocked for vault content | ⏳ pending |
| G | **Fallback chains** (`+ Add fallback`) | ⏳ pending |
| H | Corrupt-config recovery ("Reset?" callout) | ⏳ pending |
| I | Keyboard nav / a11y | ⏳ pending |
| J | Clean stream cancellation | ⏳ pending — **note:** no `chat()` consumer exists in 016, so true streaming/cancellation is first *exercised* by Feature 017. For now this is design-confirmed, not live-confirmed. |

**Likely future breakages to watch for** (same class as A/E — runtime/UX, not unit-testable):
- **B/C:** keychain write/read via `keyring` on Windows Credential Manager; confirm Anthropic's `unsafe-headers` actually carry `x-api-key` (403 if dropped).
- **F:** confirm the router's per-step lockdown gate visibly blocks remote steps (the `routerImpl` gate is unit-tested; the UI reflection is the live check).
- **H:** hand-corrupt the `ai.config` row, confirm the "Reset?" callout (T028a).

---

## 6. Immediate next steps (in order)

1. **Walk the user through B–J.** Fix anything surfaced (diagnose live → minimal fix → `tsc`+tests+lint → user re-verifies). Mirror how A/E were handled.
2. **When the user says the quickstart clears and authorizes the commit**, commit Feature 016. Stage **specifically** (never `git add -A`):
   - Modified: `.specify/feature.json`, `CLAUDE.md`, `PRD-CIC-Platform.md`, `eslint.config.js`, `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`, `src/app/routes/settings/SettingsRoute.tsx`, `src/app/test-support.tsx`, `src/main.tsx`
   - Untracked (new): `specs/016-ai-provider-layer/`, `src/ai/`, `src/app/providers/AIProvider.tsx`, `src/features/settings/`
   - **Do NOT stage** `HANDOVER.md` (this file).
   - Conventional Commit, e.g. `feat(ai): vendor-agnostic AI provider layer — types, adapters, router, settings (Feature 016)`, with the `Co-Authored-By: Claude` trailer.
3. **Push the branch, open a PR** (the repo uses GitHub; `gh` works once a remote exists — confirm `git remote -v` first; the planned repo is `CryerWorks/CIC`). PR body explains what/why + the in-session reversals (plugin-http, probe).
4. **Rebase-merge to `main`** (squash/rebase to keep history clean — match 012–015; confirm the merge style with the user).
5. **Deliver the mandatory end-of-feature walkthrough** if not already done (end-to-end flow, data routing, business logic, call graph with named files, design rationale, senior-review flags).

---

## 7. After 016 — the roadmap

**Phase 2 (retention engine) is feature-complete** (010 FSRS SRS, 012 Daily Loop, 013 course session planner, 014 reminders, 015 Projects). **Phase 3 (AI) has just begun with 016.**

**Next feature = 017: F10.2 RAG ingestion** (PRD §F10.2) — the **first consumer** of the provider layer:
- Chunk + embed + vector store + retrieval.
- Calls `router.embed('embeddings', texts, { containsVaultContent: true })` — note `containsVaultContent` is **required** and the router's lockdown gate runs on embed identically to chat (RAG indexes vault text).
- Vector store: `sqlite-vec` (default) or LanceDB — see PRD tech table.
- This is where **streaming and the embed re-route get their first live exercise** — validate them here.

Later Phase-3 features (consume the same `useAIRouter()`): F10 course generation (scaffold-default; full-draft requires an explicit call-time flag, never sticky), F4/F5 Feynman tutor + retrieval quizzes, F6 interleaving/desirable-difficulty scheduler. Respect PRD §12 phase order.

---

## 8. Conventions, gotchas & known caveats

- **TypeScript strict, no `any`** (use `unknown` + narrowing). Parse all external/frontmatter/AI-JSON through **zod**.
- **ESLint import boundaries** (each bridge confined to its adapters dir): `@tauri-apps/plugin-sql` → `src/db/adapters/*`; `@tauri-apps/plugin-fs` → `src/vault/adapters/*`; `@tauri-apps/plugin-notification` → `src/notifications/adapters/*`; `@tauri-apps/plugin-http` + vendor AI SDKs → `src/ai/adapters/*`; `ts-fsrs` → `src/features/srs/fsrs/scheduler.ts`. The composition roots (`AIProvider.tsx`, `test-support.tsx`) are the *only* exempt importers of adapter barrels — see `src/ai/boundary.test.ts`'s `COMPOSITION_ROOT_EXEMPTIONS`.
- **Tests inject fakes.** Adapters take an injectable `fetchFn` (tests use `fakeFetch`); `AIProvider` takes `createProviderFn` + `secretStore` + `fetchFn` DI props. `tauriFetch` is lazy (dynamic `import`) so jsdom never loads the plugin.
- **`probe()` returns declared capabilities + latency, not per-capability liveness.** OpenAI-compatible statically declares `embeddings: true`, but a server only embeds if an embedding model is loaded. Expect a 404 from a chat-only server when 017 first calls `embed` — the router's embed re-route handles it. Not a bug.
- **The model field in Role routing is free-text, not a dropdown** of the server's models (routing must support models the probe doesn't enumerate; remote providers have hundreds). Default-model prefill covers the common case. A "/v1/models dropdown" is a reasonable future enhancement — scope separately if the user wants it.
- **Capability HTTP scope is deliberately broad** (`http://*:*` / `https://*:*`). The router — not the static scope — is the authoritative lockdown boundary (the scope can't enumerate runtime-configured URLs). Documented in `research.md` R2.
- **Streaming is unexercised until a consumer exists.** plugin-http streams incrementally on ≥2.4.1 (pinned 2.5.9); if 017 ever sees one buffered blob instead of tokens, the verified-sound contingency is a custom `#[tauri::command]` + `tauri::ipc::Channel<&[u8]>` behind the *same* `fetchFn` seam (drop-in). See `research.md` R2 "Reversal".
- **Windows / PowerShell environment.** Tauri uses WebView2 here (stricter CORS than macOS WKWebView — that's why the CORS bug was Windows-specific). There's an `ast-outline` tool for structural code queries (`mcp__ast-outline__*`) — prefer it over full-file reads for shape.

---

## 9. Run / verify commands

```bash
npm run dev          # Vite dev server (frontend only)
npm run tauri dev    # full app in the Tauri shell (the user's live check)
npm run test         # Vitest  (baseline this session: 558 passing)
npm run lint         # ESLint (incl. the vendor-import boundary rule)
npx tsc --noEmit     # typecheck
npx vite build       # production frontend build
cd src-tauri && cargo check   # Rust check (keyring + tauri-plugin-http compile here)
```

**Green baseline at handover:** 558 tests pass · tsc clean · ESLint clean · `vite build` clean · `cargo check` exit 0.

One known **flake**: `src/features/projects/ProjectsSection.test.tsx` occasionally times out under full-suite parallel load; passes in isolation. Not a regression — don't chase it.

---

## 10. The AI layer at a glance (file map)

```
src/ai/
├── provider.ts        # Provider interface, ChatMessage/Options/Chunk, EmbedOptions/Result,
│                      #   ProviderCapabilities, ProbeOutcome  (SPINE)
├── errors.ts          # ProviderError + kind union + predicates  (SPINE)
├── classification.ts  # isLocalHost / isLanHost (pure)  (SPINE-adjacent)
├── config.ts          # AIConfig/ProviderConfig/RoleTarget zod schemas, load/saveAIConfig  (SPINE)
├── secrets.ts         # SecretStore interface + InMemorySecretStore  (SPINE)
├── router.ts          # AIRouter interface  (SPINE)
├── routerImpl.ts      # defaultRouter: role resolve, per-step lockdown gate, fallback walk,
│                      #   embed re-route, probe cache  (DEEP — the chokepoint)
├── boundary.test.ts   # runtime assertion: no feature imports an adapter class
├── adapters/          # the ONLY place vendor/HTTP/keychain specifics live (ESLint-confined)
│   ├── index.ts                 # createProvider factory
│   ├── ollama.ts / openai-compatible.ts / anthropic.ts
│   ├── sse.ts / ndjson.ts       # inline stream parsers
│   ├── tauriFetch.ts            # native-HTTP seam (lazy @tauri-apps/plugin-http)
│   └── secrets/tauri.ts         # TauriKeychainSecretStore (ai_keychain_* commands)
└── testing/           # fakeFetch + runAdapterContract harness (tests only)

src/app/providers/AIProvider.tsx     # composition root → useAIRouter()
src/features/settings/ai/            # AISection, ProviderForm, ProviderList,
                                     #   RoleRoutingEditor, LockdownToggle, useAIConfig
src-tauri/src/lib.rs                 # ai_keychain_* + plugin registration (incl. tauri_plugin_http)
src-tauri/capabilities/default.json  # http:default scope, keychain has no scope (custom cmd)
```

---

### One-line orientation for your first message to the user
> "I've read the handover. Feature 016 is code-complete and green (558 tests); we're holding the commit until the live quickstart (B–J) clears. Want to continue with Scenario B (add a remote provider with a real key and verify the keychain write)?"
