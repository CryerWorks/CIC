import type { SqlExecutor } from "../executor";
import { VaultRecordSchema, type VaultRecord } from "../models/vault";
import { selectParsed } from "./query";

/**
 * Per-vault dataset bookkeeping (Feature 009). A `vaults` row records a connected vault's stable
 * identity (the in-vault marker UUID) and its last-connected folder path. Domains scope to a vault
 * via `domains.vault_id`; everything below inherits transitively. Over the `SqlExecutor` seam —
 * the vault layer/connector calls these; no SQL leaks into features (Constitution IV).
 */

/**
 * Establish (or refresh) a vault's record and adopt any unowned data into it (FR-008). Upserts the
 * row on `id`, always refreshing `path` (so a moved folder's path stays current) but never touching
 * `created_at`. Then adopts every `domains.vault_id IS NULL` row — the legacy global set from before
 * this feature — into this vault. Self-limiting: the first vault attached after upgrade claims the
 * orphans; once none are NULL, later vaults adopt nothing (no cross-vault bleed).
 */
export async function attachVault(
  db: SqlExecutor,
  input: { id: string; path: string },
): Promise<void> {
  await db.execute(
    `INSERT INTO vaults (id, path, created_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET path = excluded.path`,
    [input.id, input.path, new Date().toISOString()],
  );
  await db.execute("UPDATE domains SET vault_id = ? WHERE vault_id IS NULL", [input.id]);
}

/** The vault record for `id`, or null if none. */
export async function getVault(db: SqlExecutor, id: string): Promise<VaultRecord | null> {
  const rows = await selectParsed(db, VaultRecordSchema, "SELECT * FROM vaults WHERE id = ?", [id]);
  return rows[0] ?? null;
}

/** The vault record whose last-connected `path` matches exactly, or null. The fallback used to
 *  recover identity when a vault's marker is missing on connect (FR-010, research R7). */
export async function getVaultByPath(db: SqlExecutor, path: string): Promise<VaultRecord | null> {
  const rows = await selectParsed(db, VaultRecordSchema, "SELECT * FROM vaults WHERE path = ?", [path]);
  return rows[0] ?? null;
}
