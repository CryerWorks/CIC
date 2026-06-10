/**
 * Tauri-backed SecretStore (Feature 016 / Constitution II). The production implementation: every
 * call routes through the `ai_keychain_*` custom commands registered in `src-tauri/src/lib.rs`,
 * which wrap `keyring-rs` and talk to the OS credential store directly.
 *
 * This file is INSIDE the ESLint-confined `src/ai/adapters/**` boundary so it may import
 * `@tauri-apps/api`. It is the **only** intended caller of the `ai_keychain_*` commands;
 * `src/ai/boundary.test.ts` asserts no other file under `src/` imports adapter-class code.
 */

import { invoke } from "@tauri-apps/api/core";
import type { SecretStore } from "../../secrets";

export class SecretStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretStoreError";
  }
}

/** Production SecretStore — talks to the OS keychain via the custom Rust command. */
export class TauriKeychainSecretStore implements SecretStore {
  async set(ref: string, secret: string): Promise<void> {
    if (!ref) throw new SecretStoreError("ref is required");
    if (!secret) throw new SecretStoreError("secret is required");
    try {
      await invoke("ai_keychain_set", { reference: ref, secret });
    } catch (e) {
      throw new SecretStoreError(`keychain set failed: ${stringify(e)}`);
    }
  }

  async get(ref: string): Promise<string | null> {
    if (!ref) throw new SecretStoreError("ref is required");
    try {
      const result = await invoke<string | null>("ai_keychain_get", { reference: ref });
      return result ?? null;
    } catch (e) {
      throw new SecretStoreError(`keychain get failed: ${stringify(e)}`);
    }
  }

  async delete(ref: string): Promise<void> {
    if (!ref) throw new SecretStoreError("ref is required");
    try {
      await invoke("ai_keychain_delete", { reference: ref });
    } catch (e) {
      throw new SecretStoreError(`keychain delete failed: ${stringify(e)}`);
    }
  }
}

function stringify(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
