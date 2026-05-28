import { z } from "zod";
import type { SqlExecutor, SqlValue } from "../executor";

/**
 * Generic typed-query helpers. `selectParsed` + the insert/update/upsert builders are enough
 * to round-trip ANY entity through its zod model (US2's "one of each" needs no per-table
 * code). Ergonomic per-entity repositories exist only for the core hierarchy (others arrive
 * with the features that consume them — Constitution IV, no organizational-only code).
 */

/** Encode a domain value to its raw SQLite representation: booleans → 0/1, objects/arrays →
 *  JSON text, null/undefined → NULL, strings/numbers pass through. Mirrors the model read
 *  transforms (`_shared.ts`). JSON columns always hold objects/arrays — never bare strings —
 *  so a string is always a text column, never accidentally double-encoded. */
export function encodeValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "object") return JSON.stringify(value);
  throw new Error(`Cannot encode value of type ${typeof value} for SQLite`);
}

/** Select rows and parse each through `schema` — every row a feature sees is validated
 *  (booleans decoded, JSON parsed, enums checked). A parse failure throws a zod error. */
export async function selectParsed<S extends z.ZodTypeAny>(
  db: SqlExecutor,
  schema: S,
  sql: string,
  params: SqlValue[] = [],
): Promise<z.infer<S>[]> {
  const rows = await db.select(sql, params);
  // Spread into a plain object: some drivers (node:sqlite) hand back null-prototype rows;
  // normalizing keeps zod parsing predictable.
  return rows.map((row) => schema.parse({ ...(row as Record<string, unknown>) }));
}

/** Insert one row from a domain object (values encoded). Column order is the object's keys. */
export async function insert(
  db: SqlExecutor,
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((c) => encodeValue(row[c]));
  await db.execute(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );
}

/** Update columns of one row matched by an equality `where` clause. */
export async function update(
  db: SqlExecutor,
  table: string,
  set: Record<string, unknown>,
  where: Record<string, unknown>,
): Promise<void> {
  const setCols = Object.keys(set);
  const whereCols = Object.keys(where);
  const assignments = setCols.map((c) => `${c} = ?`).join(", ");
  const conditions = whereCols.map((c) => `${c} = ?`).join(" AND ");
  const values = [
    ...setCols.map((c) => encodeValue(set[c])),
    ...whereCols.map((c) => encodeValue(where[c])),
  ];
  await db.execute(`UPDATE ${table} SET ${assignments} WHERE ${conditions}`, values);
}

/** Insert-or-update on a natural key (e.g. `vault_writes.file_path`): on conflict, overwrite
 *  the non-key columns. Backs FR-009 — re-recording a vault write updates its mtime/hash in
 *  place rather than duplicating. */
export async function upsert(
  db: SqlExecutor,
  table: string,
  row: Record<string, unknown>,
  conflictColumns: string[],
): Promise<void> {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns
    .filter((c) => !conflictColumns.includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const values = columns.map((c) => encodeValue(row[c]));
  const conflictClause = updates
    ? `ON CONFLICT(${conflictColumns.join(", ")}) DO UPDATE SET ${updates}`
    : `ON CONFLICT(${conflictColumns.join(", ")}) DO NOTHING`;
  await db.execute(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ${conflictClause}`,
    values,
  );
}
