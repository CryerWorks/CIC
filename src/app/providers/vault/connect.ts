import { invoke } from "@tauri-apps/api/core";
import { createVault, type Vault } from "../../../vault";
import { attachVault, getVaultByPath, type SqlExecutor } from "../../../db";

/**
 * Production vault *connector*: authorize the chosen folder's fs scope, build the Feature 005
 * vault, and probe its reachability with a read-only note count. Lives in the app composition
 * layer (not in `src/vault`, which stays pure infra with no `invoke`/app concerns). Behind the
 * `VaultConnector` seam so the provider's state machine is unit-tested without Tauri.
 */

export type ConnectResult =
  | { ok: true; vault: Vault; noteCount: number; id: string }
  | { ok: false; error: Error };

export type VaultConnector = (path: string) => Promise<ConnectResult>;

/** Grant Tauri fs access to the chosen vault folder (recursive) via the custom Rust command.
 *  Must run before any VaultReader/VaultWriter op against `path` (research R2). */
export async function authorizeVaultPath(path: string): Promise<void> {
  await invoke("grant_vault_access", { path });
}

/**
 * Resolve a vault's stable id at connect time (research R7):
 *  - marker present → use it (recognized regardless of the folder path → rename/move works);
 *  - marker absent but a `vaults` row matches this path → reuse that id and recreate the marker
 *    (recovery: an older vault, or the user deleted the marker — re-associates existing data);
 *  - otherwise → mint + write a fresh id.
 */
export async function resolveIdentity(db: SqlExecutor, vault: Vault, path: string): Promise<string> {
  const existing = await vault.identity.read();
  if (existing) return existing;

  const byPath = await getVaultByPath(db, path);
  if (byPath) {
    await vault.identity.write(byPath.id); // recreate the lost marker, keep the association
    return byPath.id;
  }
  return (await vault.identity.ensure()).id;
}

/** Build the production connector bound to the live store (for the recorded-write log). */
export function createConnector(db: SqlExecutor): VaultConnector {
  return async (path) => {
    try {
      await authorizeVaultPath(path);
      const vault = createVault({ vaultPath: path, db });
      const noteCount = (await vault.reader.list()).length; // read-only probe — no write
      // Establish the vault's stable identity (Feature 009, research R7). A failed marker write
      // throws here and surfaces as a connect failure — we never proceed with an unidentified vault.
      const id = await resolveIdentity(db, vault, path);
      await attachVault(db, { id, path }); // record the vault + adopt any pre-feature data
      return { ok: true, vault, noteCount, id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  };
}
