/**
 * The vault layer's composition root (Constitution IV). The ONE place that wires the production
 * `TauriVaultFs` and a `VaultWriteLog` backed by the Feature 003 `vault_writes` repo — so it is
 * the only file importing both `src/db` and the Tauri adapter. Consuming features receive a
 * `reader`/`writer` and never construct adapters or touch the SQL/fs plugins themselves.
 *
 * The chosen `vaultPath` must already be authorized in the Tauri fs scope at runtime (research
 * R1); the folder-picker/settings that set and persist it are a later feature.
 */

import { type SqlExecutor, recordVaultWrite, getVaultWrite, forgetVaultWrite } from "../db";
import { TauriVaultFs } from "./adapters/tauri";
import { VaultReader } from "./reader";
import { VaultWriter } from "./writer";
import type { VaultWriteLog } from "./writeLog";
import type { Fingerprint } from "./errors";

export interface Vault {
  reader: VaultReader;
  writer: VaultWriter;
}

export function createVault(opts: { vaultPath: string; db: SqlExecutor }): Vault {
  const { vaultPath, db } = opts;
  const fs = new TauriVaultFs();

  // VaultWriteLog over the 003 repo — the vault layer never sees SQLite (research R7).
  const log: VaultWriteLog = {
    async get(relPath: string): Promise<Fingerprint | null> {
      const row = await getVaultWrite(db, relPath);
      return row ? { mtime: row.app_mtime, hash: row.app_hash } : null;
    },
    async record(relPath: string, fingerprint: Fingerprint): Promise<void> {
      await recordVaultWrite(db, relPath, fingerprint);
    },
    async forget(relPath: string): Promise<void> {
      await forgetVaultWrite(db, relPath);
    },
  };

  return {
    reader: new VaultReader(fs, vaultPath, log),
    writer: new VaultWriter(fs, vaultPath, log),
  };
}
