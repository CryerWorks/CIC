# Contract: AIRouter — Routing, Fallback, Lockdown Chokepoint

**Files**:
- `src/ai/router.ts` (spine) — the `AIRouter` interface.
- `src/ai/routerImpl.ts` (deep) — `defaultRouter` implementation.

## TypeScript shape (spine)

```ts
import type { AIRole } from './config';
import type { ChatMessage, ChatOptions, ChatChunk, EmbedOptions, EmbedResult, ProviderCapabilities } from './provider';

export interface AIRouter {
  chat(role: AIRole, messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk>;
  embed(role: AIRole, texts: string[], opts: EmbedOptions): Promise<EmbedResult>;
  /**
   * Probes a configured provider. Returns the cached result by default —
   * the settings UI uses this to render capability badges without re-pinging
   * on every mount. Pass `force: true` for the "Test connection" button and
   * on first save.
   */
  probe(providerId: string, opts?: { force?: boolean }): Promise<ProviderCapabilities>;
}
```

## TypeScript shape (deep)

```ts
import type { AIConfig } from './config';
import type { Provider } from './provider';

export interface DefaultRouterDeps {
  config: AIConfig;
  providers: Map<string, Provider>;  // built by the composition root from config.providers[]
  /** Emits 'ai:auth-failed' (and optionally 'ai:lockdown-blocked') events. */
  emit?: (event: string, payload: { providerId: string }) => void;
}

export function defaultRouter(deps: DefaultRouterDeps): AIRouter;
```

## Resolution & dispatch (the algorithm)

For every `chat` / `embed` call, the router runs this state machine. **The lockdown gate runs at EVERY step of the fallback walk** — per Constitution II ("vault content cannot reach a non-local provider regardless of any other configuration") and FR-012 ("refuse to send vault content to **any** non-local provider"). See invariant L1 below.

```
function* dispatch(role, opts, callFn) {
  let target = config.routing[role];
  if (target == null) throw ProviderError('unsupported', '', 'role unassigned', false);

  // === Fallback walk — the gate runs at EVERY step, not just the primary ===
  while (true) {
    const provider = providers.get(target.providerId);
    if (!provider) {
      if (target.fallback) { target = target.fallback; continue; }
      throw ProviderError('unsupported', target.providerId, 'provider not loaded', false);
    }

    // === LOCKDOWN GATE — re-checked for each step of the walk ===
    if (opts.containsVaultContent && config.lockdown && !provider.capabilities().isLocal) {
      // Blocked at THIS step. The block itself is non-retryable, but for the WALK we
      // treat lockdown as "this step is unusable; skip to the next" — so a `[local→remote]`
      // chain with the local primary failing retryably cleanly falls through to: walk
      // hits the remote, lockdown blocks IT, and surfaces. The chain doesn't silently
      // succeed by leaking vault content. If there is no further fallback, we surface
      // the lockdown error.
      if (target.fallback) { target = target.fallback; continue; }
      throw ProviderError('unsupported', target.providerId, 'local-only lockdown blocks remote providers for vault content', false);
    }

    // === Embed capability re-route (privacy-preserving) ===
    // Runs only AFTER the lockdown gate has accepted THIS step — preserving the gate
    // decision. A re-route target that is itself remote would re-trip the gate, but
    // findLocalEmbeddings returns only local providers, so the invariant holds.
    let effectiveProvider = provider;
    if (callKind === 'embed' && !provider.capabilities().embeddings) {
      effectiveProvider = findLocalEmbeddings(providers, config) ?? provider;
    }

    try {
      return yield* callFn(effectiveProvider, target);
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      if (isAuthFailure(err)) { emit?.('ai:auth-failed', { providerId: target.providerId }); throw err; }
      if (isCancellation(err)) throw err;
      if (!err.retryable) throw err;
      if (!target.fallback) throw err;
      target = target.fallback;
    }
  }
}
```

## Invariants

L1. **Lockdown gate runs at every step of the fallback walk** — not just the primary. Per Constitution II's "regardless of any other configuration" wording and FR-012's "any non-local provider", a `[local→remote]` chain with lockdown ON and vault content MUST NOT leak vault content to the remote step if the local primary fails retryably. The gate check is inside the `while` loop, runs for each step, and either skips to the next fallback (if one exists) or surfaces the lockdown error (if not). This mirrors ai-provider-layer.md §7 step 4's "repeat" semantics — the walk repeats from the gate, not from dispatch.

   *Implication for the UI*: the routing editor SHOULD still show a warning when a fallback target is remote and lockdown is ON ("this fallback step is blocked by lockdown — vault content won't reach it") so the learner understands the topology. UI surface, but not the security gate — the gate is in the router. Lockdown enforcement is router-side; the UI is informational.

L2. **Embed re-route runs AFTER the lockdown gate (at the current step).** Within each step of the walk, the order is: gate first, embed re-route second. The re-route targets a local embeddings provider, so a re-routed call is always to a local target — the gate decision at this step is preserved. (A future amendment that allowed remote re-route targets would need to re-run the gate after the re-route; v1 doesn't have that path.)

L3. **Cancellation stops everything.** A `ProviderError('cancelled', …)` is never retried, regardless of `retryable` (defensive: `retryable` MUST be `false` for cancellation anyway).

L4. **Auth failure emits an event AND surfaces.** The router emits `'ai:auth-failed'` with `{ providerId }` so the settings UI can show "re-enter key for X". Then it throws. The router does NOT walk past auth failure into the fallback (FR-021) — a fallback past auth is configured rarely and intentionally.

   *Exception*: if the user explicitly wants "try Anthropic; if my key is dead, fall through to local Ollama", they can model that with two separate role assignments via the UI. v1 doesn't auto-fall-through past auth. If feedback wants that, it's a v2 amendment.

L5. **The router never logs request bodies or response bodies when `opts.containsVaultContent === true`** (even on `bad_response` / `unknown` error paths). The router-level log captures: `providerId`, `errorKind`, message (which the adapter has already redacted), and an opaque `<vault-content-redacted>` placeholder for any context. SC-004 verifies via the test suite.

L6. **Probe is cached by `(providerId, baseUrl, configVersion)`**. The cache lives in the router instance. A config save → new router instance → fresh cache. `force: true` bypasses the cache for one call.

L7. **The router never instantiates Provider adapters.** The composition root builds the `Map<string, Provider>` and passes it in. The router is purely a routing/policy layer. This keeps the router testable with fake providers.

## The `findLocalEmbeddings` helper

```text
findLocalEmbeddings(providers, config):
  for the embeddings role's RoleTarget chain (top-level and fallbacks), if any step references a
  provider whose capabilities().isLocal AND capabilities().embeddings:
    return that provider
  else return null  (re-route falls through; the original provider's call will likely 'unsupported')
```

This is the privacy-preserving default: even if the primary provider for some other role can't do embeddings, we route embeddings to the configured local embeddings provider when one exists in the chain.

## Test surface (`src/ai/routerImpl.test.ts`)

All tests use fake `Provider`s (in-memory, controllable) — no network, no keychain.

**Routing**:
- Unassigned role → `ProviderError('unsupported', '', 'role unassigned', false)`.
- Assigned role → calls the right provider's `chat`/`embed`.

**Fallback walk**:
- Primary throws `ProviderError('rate_limit', …, true)` → falls through to secondary, which succeeds.
- Primary throws `ProviderError('timeout', …, true)` → falls through.
- Primary throws `ProviderError('offline', …, true)` → falls through.
- Primary throws `ProviderError('bad_response', …, false)` → surfaces immediately, no fallback.
- Primary throws `ProviderError('auth', …, false)` → emits `'ai:auth-failed'`, surfaces, no fallback.
- Every step fails retryably → surfaces the last error.

**Lockdown gate**:
- `containsVaultContent: true`, lockdown ON, primary remote, no fallback → throws `unsupported` "local-only lockdown blocks…", non-retryable.
- `containsVaultContent: true`, lockdown ON, primary local → passes through normally at the primary.
- `containsVaultContent: true`, lockdown OFF, primary remote → passes through normally.
- `containsVaultContent: false`, lockdown ON, primary remote → passes through normally (the gate doesn't trip on non-vault content).
- The lockdown gate trips on `embed` too (RAG indexing).
- The lockdown gate runs BEFORE the embed re-route at the current step (a remote step with no embeddings is BLOCKED, not re-routed).
- **Per-step gating** (regression test for the C1 remediation, the Constitution II invariant): a `[local→remote]` chain with lockdown ON and `containsVaultContent: true`, when the LOCAL primary fails retryably (e.g. `offline`), MUST surface the lockdown error from the remote step — NOT silently leak vault content to the remote. The test asserts the remote provider's `chat` / `embed` is **never invoked** in this scenario.
- A `[remote→local]` chain with lockdown ON and `containsVaultContent: true` — primary remote, fallback local. The gate trips on the primary, skips to the local fallback, which serves the call. Verifies the walk's "skip on lockdown" semantics work.

**Embed re-route**:
- Embed role's primary is a chat-only Ollama (no embeddings) + the chain's fallback is a local-embeddings Ollama → re-routes to the embeddings Ollama (after gate).
- If no local embeddings provider exists in the chain → falls through to the primary's `embed`, which throws `unsupported`, which then walks the chain normally.

**Cancellation**:
- A pending stream cancelled via `signal.abort()` throws `ProviderError('cancelled', …)` and does NOT walk the fallback.

**Probe**:
- First call hits the provider; second call (same id, no `force`) returns cached.
- `{ force: true }` re-hits the provider.
- Cache is keyed by `(providerId, baseUrl, configVersion)`.

**Vault-content redaction**:
- A `chat` call with `containsVaultContent: true` that throws `bad_response` produces an error whose message + stringification contain `<vault-content-redacted>` and no actual content tokens.

**Auth event**:
- An `'ai:auth-failed'` listener registered via `emit` receives `{ providerId }` exactly once per auth throw.
