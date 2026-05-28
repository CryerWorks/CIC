import { invoke } from "@tauri-apps/api/core";
import { createVault, type Vault } from "../../../vault";
import type { SqlExecutor } from "../../../db";

/**
 * Production vault *connector*: authorize the chosen folder's fs scope, build the Feature 005
 * vault, and probe its reachability with a read-only note count. Lives in the app composition
 * layer (not in `src/vault`, which stays pure infra with no `invoke`/app concerns). Behind the
 * `VaultConnector` seam so the provider's state machine is unit-tested without Tauri.
 */

export type ConnectResult =
  | { ok: true; vault: Vault; noteCount: number }
  | { ok: false; error: Error };

export type VaultConnector = (path: string) => Promise<ConnectResult>;

/** Grant Tauri fs access to the chosen vault folder (recursive) via the custom Rust command.
 *  Must run before any VaultReader/VaultWriter op against `path` (research R2). */
export async function authorizeVaultPath(path: string): Promise<void> {
  await invoke("grant_vault_access", { path });
}

/** Build the production connector bound to the live store (for the recorded-write log). */
export function createConnector(db: SqlExecutor): VaultConnector {
  return async (path) => {
    try {
      await authorizeVaultPath(path);
      const vault = createVault({ vaultPath: path, db });
      const noteCount = (await vault.reader.list()).length; // read-only probe — no write
      return { ok: true, vault, noteCount };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  };
}
