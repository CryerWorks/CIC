import type { SqlExecutor } from "../executor";
import { DomainSchema, type Domain } from "../models/domain";
import { insert, selectParsed, update } from "./query";

/** Create a Domain (id generated app-side — research R5). Returns the parsed, validated row. */
export async function createDomain(
  db: SqlExecutor,
  input: { name: string; color: string },
): Promise<Domain> {
  const row: Domain = { id: crypto.randomUUID(), name: input.name, color: input.color };
  await insert(db, "domains", row);
  return DomainSchema.parse(row);
}

export async function getDomain(db: SqlExecutor, id: string): Promise<Domain | null> {
  const rows = await selectParsed(db, DomainSchema, "SELECT * FROM domains WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function listDomains(db: SqlExecutor): Promise<Domain[]> {
  return selectParsed(db, DomainSchema, "SELECT * FROM domains ORDER BY name");
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
