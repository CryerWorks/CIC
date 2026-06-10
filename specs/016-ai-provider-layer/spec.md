# Feature Specification: AI Provider Layer

**Feature Branch**: `016-ai-provider-layer`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: AI Provider Layer (PRD §10, Phase 3 spine — the vendor-agnostic AI abstraction that everything else in Phase 3 hangs off). One mega-feature shipping the entire layer in one PR: types + errors + config + secrets + three adapters + router + Settings UI.

## User Scenarios & Testing *(mandatory)*

This feature ships the **AI provider infrastructure** — the configurable, vendor-agnostic backbone every later Phase 3 feature (RAG ingestion, the Feynman tutor, course generation, the interleaving scheduler) will use. It introduces **no AI-driven user features** by itself: at the end of this feature, the learner can configure providers, securely store keys, assign roles to providers, set up fallback chains, and toggle Local-only lockdown — but no surface in the app yet *calls* a provider on the learner's behalf. The verification surface is `/settings`; the value delivered is "the app is ready to be AI-powered, on the learner's terms, with privacy controls in place from day one".

### User Story 1 - Configure a fully local AI provider (Priority: P1)

The learner has a local AI runtime (e.g., Ollama) running on their machine. They open the app's settings, add it as a provider, verify it responds, and assign it to all three AI roles (reasoning, drafting, embeddings). With this done, the app is fully ready to power AI features without any network access whatsoever.

**Why this priority**: Local-first is the product's defining stance (Constitution I — fully local; CLAUDE.md guardrail #8 — local-only lockdown). A local provider is the simplest case (no API key, no key storage, no remote round-trip), unblocks every later AI feature without requiring any subscription or trust handoff, and demonstrates the fully-offline guarantee. Without P1, no AI feature can ship; with P1 alone, every later AI feature can run end-to-end locally.

**Independent Test**: With a local AI runtime running, the learner opens `/settings`, navigates to AI Providers, adds the local runtime as a provider with its default endpoint, clicks "Test connection", sees latency + capabilities + a "local" badge within seconds, assigns it to all three roles, restarts the app, and confirms the configuration persists.

**Acceptance Scenarios**:

1. **Given** the AI Providers settings section is empty, **When** the learner adds a local provider with the default endpoint and saves, **Then** the provider appears in the list classified as "local" with no API key requested.
2. **Given** the local runtime is reachable, **When** the learner clicks "Test connection", **Then** within a few seconds they see latency, the runtime's capabilities (chat, embeddings, streaming), and a "local" classification.
3. **Given** the local runtime is NOT reachable, **When** the learner clicks "Test connection", **Then** a clear, actionable message appears identifying the failure ("couldn't reach the runtime — is it running?") rather than a generic error.
4. **Given** one local provider is configured, **When** the learner assigns it to reasoning, drafting, and embeddings roles and restarts the app, **Then** the routing configuration persists exactly as set.
5. **Given** lockdown is ON and the only configured provider is local, **When** the learner inspects the routing UI, **Then** every role shows "OK — local" with no blocked-content warnings.

---

### User Story 2 - Configure a remote provider with secure key storage (Priority: P2)

The learner wants to use a remote frontier model (OpenAI-compatible endpoint, OpenRouter, Anthropic, etc.) for higher-quality reasoning while keeping their vault private. They add the remote provider with its API key, the app stores the key in the OS keychain (never in the config file, never in the vault, never logged), and they can clearly see which providers will and won't receive vault content when Local-only lockdown is on.

**Why this priority**: Remote providers are a real user need — local models can't match frontier capability — but they must be opt-in, key-secure, and obviously gated. This story exercises the security-critical paths (key storage, key non-leakage in logs/errors, the lockdown gate). P2 because the product can ship with P1 alone (local-only is a complete product); P2 unlocks the second half of the routing matrix.

**Independent Test**: The learner adds a remote provider with a real API key, inspects the on-disk config file to confirm the raw key isn't present, tests the connection successfully, toggles lockdown on/off and observes the routing UI's vault-content classification change, deletes the provider, and confirms the keychain entry was removed.

**Acceptance Scenarios**:

1. **Given** the learner adds an OpenAI-compatible provider with a hosted-service URL and pastes an API key, **When** they save, **Then** the on-disk config contains an opaque key reference but **never** the key itself.
2. **Given** a remote provider is configured, **When** the learner views its detail, **Then** it shows "remote" with the host displayed prominently (so the privacy implication is obvious).
3. **Given** a remote provider with a LAN-IP endpoint (e.g., `192.168.x.x`, `10.x.x.x`), **When** classified, **Then** the UI shows "remote (LAN)" with a tooltip explaining that lockdown will still treat it as non-local for vault content (the app cannot verify a LAN endpoint's egress posture).
4. **Given** lockdown is OFF, **When** the learner clicks "Test connection" on the remote provider, **Then** a successful probe returns latency and capabilities.
5. **Given** lockdown is ON, **When** the learner views the routing UI, **Then** every role currently assigned to a remote provider is flagged "vault content blocked by lockdown" with a clear, plain-language explanation.
6. **Given** a provider configured with an invalid/revoked API key, **When** the learner clicks "Test connection", **Then** within seconds they see an "authentication failed" message offering a "re-enter key" action — not a silent fallback past the auth failure.
7. **Given** a remote provider is removed, **When** the learner confirms the deletion, **Then** the keychain entry is also removed and any role assignments referring to the provider are cleared (with a warning surfaced before confirmation).

---

### User Story 3 - Fallback chain for graceful degradation (Priority: P3)

The learner has both a remote provider (preferred for quality) and a local provider (always available) and wants the app to fall back to the local one automatically when the remote provider is unavailable (offline, rate-limited, transient timeout). They configure a fallback chain on each role in the routing UI, see the chain rendered as an ordered list, and trust that the app will degrade gracefully without manual intervention.

**Why this priority**: Reliability — real-world remote providers fail. P3 because this story has no user-visible effect *during this feature* (no AI surface calls the router yet); the fallback semantics are exercised by the test suite. The first AI consumer (in a future feature) will surface the graceful-degradation experience end-to-end. The configuration UI ships here so the learner can set up the chains before AI features arrive.

**Independent Test**: With two providers configured (one remote, one local), the learner sets the reasoning role with the remote as primary and the local as fallback. The chain is shown as an ordered list and persists across restart. The router's chain-walking on retryable errors is verified by automated tests (no AI feature consumes the router in this feature).

**Acceptance Scenarios**:

1. **Given** two providers are configured, **When** the learner edits the reasoning role and clicks "Add fallback", **Then** they can pick another provider+model, and the chain renders as an ordered list (e.g., "Frontier model → Local Ollama").
2. **Given** a role has a fallback chain, **When** the learner views the routing UI, **Then** the chain ordering is visible and editable (remove a step, add more). Reordering is performed by remove-then-re-add (drag-reorder deferred to v2).
3. **Given** a primary provider is configured to fail with a retryable error in an automated test, **When** the router serves the role, **Then** the fallback is consulted and the call succeeds (verified by the contract test suite — the user-visible experience arrives with the first AI consumer).
4. **Given** the learner removes the primary provider, **When** confirmed, **Then** the next step in the chain is promoted to primary; if no fallback exists, the role becomes unassigned and the UI flags it clearly.
5. **Given** every provider in a chain fails on a non-retryable error (e.g., authentication), **When** the test suite exercises the chain, **Then** the router surfaces the auth failure for the failing provider rather than silently swallowing it.

---

### Edge Cases

- **LAN endpoint masquerading as local**: A user running a local AI runtime on a home-LAN box at `192.168.1.x` is classified as remote with a "remote (LAN)" tooltip — deliberate, because the app cannot verify the box's egress posture.
- **Same-id provider added twice**: Validation refuses; clear "an id like that already exists" error.
- **API key pasted with leading/trailing whitespace**: Trimmed before storage.
- **Lockdown toggled ON while a remote call is mid-stream**: In-flight calls complete normally; subsequent calls are blocked.
- **Provider label renamed after roles depend on it**: Roles continue to resolve correctly — the provider's stable id is the link, not the human label.
- **Removing the only provider serving a role**: The role becomes unassigned and the routing UI flags it; future AI consumers must handle "no provider configured" gracefully.
- **OS keychain unavailable** (rare, e.g., headless CI environment): The system surfaces a clear error and refuses to persist a secret in the clear; providers that don't require a secret (local runtimes) continue to work.
- **Corrupt or partially-written config file**: Refuse to load it, surface a clear error, leave the in-memory state empty rather than crashing. The learner can re-configure from /settings.
- **Adding a provider whose endpoint is malformed**: Validation in the form rejects before save; no broken entry is persisted.
- **Role auto-routes embed to a local embeddings provider** (when the primary lacks embeddings): This re-routing happens only **after** the lockdown gate has accepted the call, so vault content is never silently sent elsewhere.

## Requirements *(mandatory)*

### Functional Requirements

**Configuration & Persistence**

- **FR-001**: The learner MUST be able to add, edit, and remove AI provider configurations from the `/settings` surface.
- **FR-002**: System MUST persist AI provider configuration locally on the learner's machine (never in the vault, never synced anywhere) and reload it on next launch.
- **FR-003**: System MUST validate configuration on load; corrupt or partial configuration MUST surface as a clear error and MUST NOT crash the app.
- **FR-004**: System MUST support at least three provider kinds: a fully local runtime (e.g., Ollama), an OpenAI-compatible HTTP endpoint (covering OpenRouter, OpenAI, LM Studio, llama.cpp's server, vLLM, Together, Groq, and other compatible vendors via a single adapter), and Anthropic's API.

**Roles & Routing**

- **FR-005**: System MUST recognize exactly three AI roles: **reasoning**, **drafting**, and **embeddings**.
- **FR-006**: Learner MUST be able to assign each role to a configured provider + a chosen model.
- **FR-007**: Learner MUST be able to **add** and **remove** fallback targets (an ordered chain of provider+model pairs) on each role assignment. v1 ships add + remove only — to change the order, the learner removes a step and re-adds it. Drag-reorder is deferred to a v2 polish pass (deliberately out of scope; rationale: this feature already ships a large surface in one PR, and the no-AI consumer landing means there's no time pressure on the reorder UX).
- **FR-008**: System MUST walk the fallback chain when a provider returns a *retryable* failure (network unreachable, timeout, rate limit, unsupported capability) and surface a *non-retryable* failure (authentication, user-cancelled) immediately.

**Local vs Remote Classification**

- **FR-009**: System MUST classify a provider's endpoint as **local** only when its host resolves to `localhost`, `127.0.0.1`, or `::1`. Every other host — including LAN addresses (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`) — MUST be classified as **remote**.
- **FR-010**: The settings UI MUST distinguish "remote" from "remote (LAN)" so the learner understands lockdown will still gate LAN endpoints, with a tooltip explaining the rationale.

**Lockdown & Privacy**

- **FR-011**: System MUST expose a single global "Local-only lockdown" toggle, persisted with the configuration.
- **FR-012**: When lockdown is ON, the system MUST refuse to send vault-derived content (RAG context, note text, ingested source excerpts, session writeups, project body content) to any non-local provider — on **both** chat and embedding calls.
- **FR-013**: When the lockdown gate blocks a call, the surfaced error MUST clearly identify which provider was blocked and why ("local-only lockdown is on; X is remote"), and MUST be marked non-retryable.
- **FR-014**: Callers MUST declare for every AI call whether the payload contains vault-derived content. The system MUST treat this declaration as the single source of truth for lockdown gating; there is no auto-classification.

**Secrets**

- **FR-015**: API keys MUST be stored in the operating system's secure credential store (Windows Credential Manager, macOS Keychain, Linux libsecret/equivalent). The on-disk configuration MUST contain only an opaque reference to the key, never the key itself.
- **FR-016**: API keys MUST never appear in any log line, error message, exported configuration, telemetry payload, crash report, or file written to disk in cleartext.
- **FR-017**: When a request payload contains vault content (per FR-014), the system MUST NOT log the request body or the response body — even on error paths (timeout, parse failure, unknown error).
- **FR-018**: Removing a provider MUST also remove its associated secret from the OS credential store.

**Probing & Capabilities**

- **FR-019**: System MUST provide a "Test connection" affordance per configured provider that probes it for: reachability, latency, supported capabilities (chat, embeddings, streaming), and the computed local/remote classification.
- **FR-020**: Probe results MAY be cached by default to avoid re-pinging every time the settings UI mounts; a "force refresh" path MUST exist for the "Test connection" button and on first save.

**Failure Modes**

- **FR-021**: When a provider returns an authentication failure, the system MUST surface a re-authentication prompt for that provider rather than silently falling through the chain unless a fallback is explicitly configured.
- **FR-022**: System MUST support cancellation of in-flight streaming responses (e.g., the learner clicks "stop").
- **FR-023**: A streaming response MUST yield incremental output and a single, unambiguous "done" signal at the end.

**Architectural Invariants** (testable system-level requirements)

- **FR-024**: Vendor-specific SDKs and HTTP client specifics MUST live in exactly one directory of the codebase. Anywhere else in the codebase MUST be unable to import them (enforced by lint).
- **FR-025**: All AI calls in the app MUST flow through a single routing chokepoint; no feature MUST instantiate a provider adapter directly. (At the end of this feature, the chokepoint exists but has no consumers — verified by the absence of adapter imports outside the lint-bounded directory.)
- **FR-026**: Adding a new vendor MUST require adding exactly one new adapter file and updating the provider-kind enumeration; no other source file outside the adapter boundary MUST need to be edited.

**Offline Operation**

- **FR-027**: With at least one local provider configured for each role, the app MUST function fully offline — no outbound network call is required to navigate the settings UI, configure providers, or use any non-AI feature of the app.

### Key Entities

- **Provider configuration**: A single configured AI backend. Has a stable id, a human label (editable), a kind (local-runtime / OpenAI-compatible / Anthropic), an endpoint (for kinds that need one), an opaque reference to a stored secret (for kinds that need authentication), and optional default model identifiers.
- **Role assignment**: For each of the three roles (reasoning, drafting, embeddings): a primary provider+model, plus an ordered chain of fallback provider+model pairs.
- **Lockdown setting**: A single boolean — when ON, every vault-content-bearing call is gated against non-local providers.
- **Secret reference**: An opaque id stored in the configuration; the actual secret lives only in the OS credential store and is fetched at call time inside the adapter.
- **Caller content classification**: A boolean every caller declares per AI call ("this payload contains vault content"). The single input to the lockdown gate.
- **Capability snapshot**: Per provider — whether it supports chat, embeddings, streaming, and whether it is classified local based on its endpoint. Refreshed on probe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner with a running local AI runtime can add the provider, test it, assign it to all three roles, and confirm "ready for AI features" — in under **3 minutes** from opening `/settings`.
- **SC-002**: A learner with an API key can add a remote provider, securely store the key, test the connection, and assign it to at least one role — in under **5 minutes**.
- **SC-003**: With Local-only lockdown ON, every attempt to send vault-derived content to a non-local provider is blocked **100% of the time** in the contract test suite, with a clear, plain-language explanation surfaced to the learner.
- **SC-004**: Across at least **100 simulated provider calls** spanning success, authentication failure, timeout, rate limit, cancellation, and unknown errors, zero API keys appear in any captured log line, exported configuration, or error message (verified by an assertion in the test harness).
- **SC-005**: With one local provider configured per role and the network fully disconnected, the settings UI — including "Test connection" for the local provider — functions with no error states from network-dependent code paths.
- **SC-006**: A misconfigured provider (wrong URL, wrong key) produces a user-readable error message identifying the *kind* of failure (auth, offline, timeout, rate-limit, bad response) within **10 seconds** of "Test connection".
- **SC-007**: Adding a hypothetical new vendor in the future requires editing exactly **one** new source file inside the adapter boundary (plus the provider-kind enumeration); no source file outside the adapter boundary needs editing (verifiable by a future feature's diff).
- **SC-008**: The AI Providers settings UI is fully keyboard-navigable: add → fill in fields → store secret → assign role → toggle lockdown → save, using only Tab / Shift+Tab / Enter / Space / arrow keys.
- **SC-009**: Across the contract test suite, an in-flight streaming response can be cancelled via the abort signal and the test observes graceful cancellation (no orphaned promises, no unhandled rejection, single `done`-style terminal event).

## Assumptions

- **Single user, single machine.** The configuration is per-install; no profile syncing.
- **Desktop platform.** An OS-level credential store is available (Windows Credential Manager, macOS Keychain, or libsecret on Linux). Headless / containerized environments without a credential store are out of scope for v1.
- **Provider operator handles their endpoint's posture.** The app classifies an endpoint as local only when its host is `localhost`/`127.0.0.1`/`::1` (deliberately narrow). LAN endpoints are treated as remote — this is documented in the UI to avoid surprise.
- **`containsVaultContent` is caller-declared, not auto-detected.** A boolean every AI caller passes; there is no scanner attempting to classify prompts. The interface enforces it (no safe default — every call site must decide).
- **The first AI consumer ships in a later feature.** At the end of this feature, the settings surface and the test suite are the only verification path. There is no feature in the app that *calls* the router on the learner's behalf yet — F4 tutor, F10 generation, F10.2 RAG, F6 scheduler arrive in subsequent features. The fallback-chain experience (P3) is therefore exercised by the test suite here; the user-visible degradation will land with the first consumer.
- **One mega-feature is the learner's explicit choice.** Alternatives — split across multiple features (e.g., foundation then one adapter at a time) — were considered and rejected to simplify downstream feature integration. The acknowledged cost is a larger-than-typical PR.
- **No vault-side change.** This feature persists no data to the vault, runs no migration on the SQLite database (no AI data lives in SQLite yet), and does not extend the Markdown schema. Configuration lives in the app's local config directory only.
- **Existing settings surface is the host.** The `/settings` route exists (from the 014 Notifications feature) and is the natural home for the AI Providers section.
- **No new outbound network is enabled by default.** Out-of-the-box, the app makes no outbound calls; only after the learner explicitly configures a remote provider can it reach a remote endpoint, and even then lockdown blocks vault content if enabled.
- **"Test connection" is per-provider, not per-routed-role.** Verifying a fallback chain end-to-end requires a consumer; the test suite covers it via fakes. A "test the routing chain" UI affordance is deferred.

## Out of Scope (deferred to later features)

The following are deliberately excluded from this feature and tracked for later phases:

- RAG ingestion: chunking, embedding pipeline, vector store, retrieval logic (F10.2 — will call the embeddings role).
- Course generation from a conversation or a document (F10).
- The Feynman / Socratic tutor (F4) and retrieval quizzes (F5).
- The interleaving / desirable-difficulty scheduler (F6).
- Any prompt template library content (the templates directory may exist as scaffolding, but no prompts are written; no feature consumes them).
- Tool / function-calling capability (the type interface reserves a `tools` capability flag but no implementation exists; v1 features don't need it).
- **Drag-reorder of fallback chain steps** — v1 ships add + remove (FR-007); learners reorder by remove-then-re-add. Drag-reorder is a v2 UX polish pass.
- Token / cost surfacing per call (optional, remote-only, deferred).
- Streaming embeddings / batching with concurrency caps for local servers (deferred).
- Automatic classification of "does this prompt contain vault content?" — the caller-declared flag remains the contract.
- LAN-as-local: not supported by design (a deliberate narrowing for safety).
- Migrating any existing AI-ish code (there is none yet).
