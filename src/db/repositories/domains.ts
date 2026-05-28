import type { SqlExecutor } from "../executor";
import { DomainSchema, type Domain } from "../models/domain";
import { insert, selectParsed, update } from "./query";

/** Create a Domain in a vault (Feature 009 — scoped). Returns the parsed, validated row. */
export async function createDomain(
  db: SqlExecutor,
  vaultId: string,
  input: { name: string; color: string },
): Promise<Domain> {
  const row: Domain = {
    id: crypto.randomUUID(),
    name: input.name,
    color: input.color,
    vault_id: vaultId,
  };
  await insert(db, "domains", row);
  return DomainSchema.parse(row);
}

export async function getDomain(db: SqlExecutor, id: string): Promise<Domain | null> {
  const rows = await selectParsed(db, DomainSchema, "SELECT * FROM domains WHERE id = ?", [id]);
  return rows[0] ?? null;
}

/** All Domains in the active vault (Feature 009 — scoped), ordered by name. */
export async function listDomains(db: SqlExecutor, vaultId: string): Promise<Domain[]> {
  return selectParsed(
    db,
    DomainSchema,
    "SELECT * FROM domains WHERE vault_id = ? ORDER BY name",
    [vaultId],
  );
}

/** Rename/recolor a Domain (Feature 004). A name colliding with another Domain hits the
 *  `domains.name` UNIQUE constraint and rejects. Returns the parsed, updated row. */
export async function updateDomain(
  db: SqlExecutor,
  id: string,
  patch: { name: string; color: string },
): Promise<Domain> {
  await update(db, "domains", { name: patch.name, color: patch.color }, { id });
  const rows = await selectParsed(db, DomainSchema, "SELECT * FROM domains WHERE id = ?", [id]);
  if (!rows[0]) throw new Error(`Domain ${id} not found`);
  return rows[0];
}

/** Delete a Domain (Feature 004). The schema's ON DELETE CASCADE removes its campaigns/courses
 *  (and their descendants) — the UI confirms this consequence first. */
export async function deleteDomain(db: SqlExecutor, id: string): Promise<void> {
  await db.execute("DELETE FROM domains WHERE id = ?", [id]);
}

/** Default color for a Domain auto-created during read-back import (Feature 007). The brand
 *  purple — user-editable later on the Domains screen. */
const IMPORT_DOMAIN_COLOR = "#8b6cef";

/** Match an existing Domain in the vault by name (case-insensitive) or create one there
 *  (read-back import, Feature 007 — now vault-scoped per Feature 009). */
export async function findOrCreateDomainByName(
  db: SqlExecutor,
  vaultId: string,
  name: string,
): Promise<Domain> {
  const existing = (await listDomains(db, vaultId)).find(
    (d) => d.name.toLowerCase() === name.toLowerCase(),
  );
  return existing ?? createDomain(db, vaultId, { name, color: IMPORT_DOMAIN_COLOR });
}
