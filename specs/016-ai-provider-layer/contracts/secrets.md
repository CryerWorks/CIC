# Contract: SecretStore — Interface + Tauri Keychain Adapter

**Files**:
- `src/ai/secrets.ts` (spine) — the `SecretStore` interface + `InMemorySecretStore` for tests.
- `src/ai/adapters/secrets/tauri.ts` (deep) — the production Tauri keychain implementation.
- `src-tauri/src/lib.rs` (deep, Rust) — `ai_keychain_set`, `ai_keychain_get`, `ai_keychain_delete` commands wrapping `keyring`.

## TypeScript shape (spine)

```ts
export interface SecretStore {
  /** Stores `secret` under `ref`. Overwrites if `ref` already exists. */
  set(ref: string, secret: string): Promise<void>;

  /** Returns the secret for `ref`, or `null` if no entry exists. */
  get(ref: string): Promise<string | null>;

  /** Removes `ref`. Idempotent — succeeds whether or not the entry existed. */
  delete(ref: string): Promise<void>;
}

/** In-memory implementation, used by tests + the contract test harness. */
export class InMemorySecretStore implements SecretStore { /* … */ }
```

## TypeScript shape (deep — Tauri impl)

```ts
// src/ai/adapters/secrets/tauri.ts
import { invoke } from '@tauri-apps/api/core';
import type { SecretStore } from '../../secrets';

export class TauriKeychainSecretStore implements SecretStore {
  async set(ref: string, secret: string): Promise<void> {
    if (!ref) throw new SecretStoreError('ref is required');
    if (!secret) throw new SecretStoreError('secret is required');
    await invoke('ai_keychain_set', { ref, secret });
  }
  async get(ref: string): Promise<string | null> {
    return (await invoke('ai_keychain_get', { ref })) as string | null;
  }
  async delete(ref: string): Promise<void> {
    await invoke('ai_keychain_delete', { ref });
  }
}

export class SecretStoreError extends Error {}
```

## Rust shape (deep — the command)

```rust
// src-tauri/src/lib.rs
use keyring::Entry;
use tauri::command;

const SERVICE: &str = "cic.ai.providers";

#[command]
async fn ai_keychain_set(r#ref: String, secret: String) -> Result<(), String> {
    Entry::new(SERVICE, &r#ref)
        .map_err(|e| e.to_string())?
        .set_password(&secret)
        .map_err(|e| e.to_string())
}

#[command]
async fn ai_keychain_get(r#ref: String) -> Result<Option<String>, String> {
    match Entry::new(SERVICE, &r#ref).map_err(|e| e.to_string())?.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[command]
async fn ai_keychain_delete(r#ref: String) -> Result<(), String> {
    match Entry::new(SERVICE, &r#ref).map_err(|e| e.to_string())?.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// Register: .invoke_handler(tauri::generate_handler![..., ai_keychain_set, ai_keychain_get, ai_keychain_delete])
```

Service name `cic.ai.providers` is **fixed** — every CIC AI provider key shows up under that service grouping in the OS keychain UI.

## Invariants

S1. **The secret never appears in JavaScript-side persistent storage.** It transits `invoke` once to set, and once to read at call time (inside the adapter). No `localStorage`, no `IndexedDB`, no settings table.

S2. **`set` is overwrite-by-default.** No idempotency token; the latest write wins. Matches user intent ("I pasted my new key — replace the old").

S3. **`delete` is idempotent.** Removing a non-existent ref succeeds silently. Simplifies the UI's "delete provider then delete secret" flow even if the secret was never set.

S4. **`get` returns `null` on missing**, never throws "not found". An adapter calling `get` on a missing ref interprets that as `auth` failure when the call requires a key.

S5. **No telemetry.** The Rust commands NEVER emit log lines containing the secret. The `keyring` crate doesn't print secrets, but we don't add `dbg!` / `eprintln!` either.

S6. **Service name is fixed and shared.** All CIC AI keys land under `cic.ai.providers`; the per-provider `ref` is the keychain "username". This way an OS-level audit ("show me my keys for CIC") groups them.

S7. **The `ref` is the provider id.** v1 simplification — there's no separate ref namespace. If a future feature needs to store a non-AI secret in the keychain, it MUST use a different service name (e.g., `cic.vault.encryption`) so namespaces don't collide.

S8. **No path through SecretStore touches a vault file.** Trivially true (it talks to the OS keychain), but worth restating: Constitution I is uninvolved here.

## Failure modes

| Condition | Behavior |
|---|---|
| OS keychain unavailable (rare; headless dev VM without `libsecret`) | `set` / `get` / `delete` throw with the underlying `keyring` error message. The settings UI catches it and surfaces "Could not access the OS keychain. Local providers (no API key) still work." (FR-015 edge case). |
| `ref` empty or `secret` empty on `set` | Throws `SecretStoreError`. Adapter shouldn't call `set` in that case; the form validates. |
| User revokes credential-store access (macOS deny dialog) | `set`/`get` throws the platform error. Same UX as keychain unavailable. |
| Key was deleted out-of-band (user opened Credential Manager, deleted CIC's entry) | Next `get` returns `null`. Next adapter call → `ProviderError('auth', …)`. UI surfaces "re-enter key" (FR-021). |

## Composition

The composition root (`AIProvider`) creates a single `TauriKeychainSecretStore` instance and passes it to:
1. The adapter factory (`createProvider(config, secrets)`) — adapters call `secrets.get(ref)` at request time.
2. The settings UI hook (`useAIConfig`) — for `set` on key-paste and `delete` on provider removal.

The router has no `SecretStore` dependency (it never touches keys directly).

## Test surface

**Spine (`src/ai/secrets.test.ts`)**:
- `InMemorySecretStore` round-trips `set` → `get`.
- `delete` is idempotent.
- `get` on missing ref returns `null` (not `undefined`, not a throw).

**Tauri impl (`src/ai/adapters/secrets/tauri.test.ts`)**:
- Mock `@tauri-apps/api/core::invoke` and assert the right command name + args per method.
- Errors from `invoke` surface as thrown errors with the underlying message preserved (without the secret).

**Live verification**: the quickstart Scenario B / C / H exercise the real OS keychain — the user adds a remote provider, restarts the app, confirms the key is still there, removes the provider, confirms the keychain entry is gone (by opening the OS keychain app).
