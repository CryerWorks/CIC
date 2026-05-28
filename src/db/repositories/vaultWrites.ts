import type { SqlExecutor } from "../executor";
import { VaultWriteSchema, type VaultWrite } from "../models/vaultWrite";
import { upsert, selectParsed } from "./query";

/**
 * Typed CRUD over the Feature 003 `vault_writes` table — the external-edit detection record
 * (PRD §13). Added by Feature 005 (no schema change). The vault layer's `VaultWriteLog` is
 * implemented over these at the composition root (`src/vault/bootstrap.ts`), keeping `src/vault`
 * independent of `src/db` internals (Constitution IV / research R7).
 */

/** Record (upsert) the app's last-written fingerprint for a vault file (FR-008). Keyed by the
 *  natural PK `file_path`; re-recording the same path updates in place rather than duplicating. */
export async function recordVaultWrite(
  db: SqlExecutor,
  filePath: string,
  fingerprint: { mtime: string; hash: string },
): Promise<void> {
  await upsert(
    db,
    "vault_writes",
    { file_path: filePath, app_mtime: fingerprint.mtime, app_hash: fingerprint.hash },
    ["file_path"],
  );
}

/** Read the recorded fingerprint row for a file (parsed via `VaultWriteSchema`), or `null` if the
 *  path has no record — the "unmanaged" case the conflict state machine treats as a conflict. */
export async function getVaultWrite(
  db: SqlExecutor,
  filePath: string,
): Promise<VaultWrite | null> {
  const rows = await selectParsed(
    db,
    VaultWriteSchema,
    "SELECT file_path, app_mtime, app_hash FROM vault_writes WHERE file_path = ?",
    [filePath],
  );
  return rows[0] ?? null;
}

/** Forget a file's recorded fingerprint (Feature 007). Called when a managed note is deleted, so
 *  a later file at the same path is correctly treated as "unmanaged" rather than silently
 *  overwritable. Idempotent — clearing an absent path is a no-op. */
export async function forgetVaultWrite(db: SqlExecutor, filePath: string): Promise<void> {
  await db.execute("DELETE FROM vault_writes WHERE file_path = ?", [filePath]);
}
