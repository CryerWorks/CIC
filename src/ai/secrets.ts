/**
 * SecretStore interface (Feature 016 / Constitution II). Adapters fetch API keys from this seam
 * at call time — never store them on the instance, never include them in errors or logs. The
 * production implementation lives at `src/ai/adapters/secrets/tauri.ts` and wraps the OS keychain
 * via a custom Rust command. Tests inject the `InMemorySecretStore` defined here.
 *
 * Spine file. Full contract:
 * [specs/016-ai-provider-layer/contracts/secrets.md](../../specs/016-ai-provider-layer/contracts/secrets.md).
 */

export interface SecretStore {
  /** Stores `secret` under `ref`. Overwrite-by-default (the latest write wins). */
  set(ref: string, secret: string): Promise<void>;

  /** Returns the secret for `ref`, or `null` if no entry exists. Never throws "not found". */
  get(ref: string): Promise<string | null>;

  /** Removes `ref`. Idempotent — succeeds whether or not the entry existed. */
  delete(ref: string): Promise<void>;
}

/** In-memory implementation for tests + the contract harness. Has the same surface contract as
 *  `TauriKeychainSecretStore` but lives entirely in-process — no IO, no Tauri, no keychain. */
export class InMemorySecretStore implements SecretStore {
  private readonly store = new Map<string, string>();

  async set(ref: string, secret: string): Promise<void> {
    if (!ref) throw new Error("ref is required");
    if (!secret) throw new Error("secret is required");
    this.store.set(ref, secret);
  }

  async get(ref: string): Promise<string | null> {
    return this.store.get(ref) ?? null;
  }

  async delete(ref: string): Promise<void> {
    this.store.delete(ref);
  }
}
