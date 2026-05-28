import type { SqlExecutor } from "../executor";
import { SettingSchema } from "../models/setting";
import { upsert, selectParsed } from "./query";

/**
 * Generic app-state key-value store over the `SqlExecutor` seam (Feature 006). Reusable for any
 * small local setting; the configured vault path lives under `vault.path`. Backed by the
 * `settings` table (migration `m0002`).
 */

/** The value for `key`, or `null` if unset. */
export async function getSetting(db: SqlExecutor, key: string): Promise<string | null> {
  const rows = await selectParsed(
    db,
    SettingSchema,
    "SELECT key, value FROM settings WHERE key = ?",
    [key],
  );
  return rows[0]?.value ?? null;
}

/** Upsert `key` → `value` (overwrites in place on the natural key). */
export async function setSetting(db: SqlExecutor, key: string, value: string): Promise<void> {
  await upsert(db, "settings", { key, value }, ["key"]);
}
