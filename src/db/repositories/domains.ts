import type { SqlExecutor } from "../executor";
import { DomainSchema, type Domain } from "../models/domain";
import { insert, selectParsed } from "./query";

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
