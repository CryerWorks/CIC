import type { SqlExecutor } from "./executor";
import { migrations as registeredMigrations } from "./migrations";

/** A schema migration: a monotonically-versioned, immutable-once-shipped SQL step. */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Split a migration's SQL into individual statements. Our migration SQL is controlled,
 *  plain DDL with no embedded semicolons (no triggers / string literals containing `;`),
 *  so a split on `;` is safe and lets both adapters run statement-by-statement. */
function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Forward-only migration runner (contracts/migration-contract.md).
 *
 * Reads `PRAGMA user_version`; applies every registered migration with `version > current`
 * in ascending order, each inside a transaction that also bumps `user_version`; idempotent
 * when nothing is pending. Throws if the store's version exceeds the latest known migration
 * (refuse newer-than-app — an older build must not operate on a newer store).
 */
export async function migrate(
  db: SqlExecutor,
  migrations: Migration[] = registeredMigrations,
): Promise<{ from: number; to: number; applied: number }> {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);

  // Guard: duplicate versions would make "applied exactly once, in order" ambiguous.
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].version === ordered[i - 1].version) {
      throw new Error(`Duplicate migration version ${ordered[i].version}`);
    }
  }

  const latest = ordered.length ? ordered[ordered.length - 1].version : 0;
  const versionRows = await db.select<{ user_version: number }>("PRAGMA user_version");
  const current = versionRows[0]?.user_version ?? 0;

  if (current > latest) {
    throw new Error(
      `Store schema version ${current} is newer than this app supports (latest known: ${latest}). ` +
        `Refusing to operate to avoid corrupting a store written by a newer build.`,
    );
  }

  const pending = ordered.filter((m) => m.version > current);
  for (const migration of pending) {
    await db.transaction(async (tx) => {
      for (const statement of splitStatements(migration.sql)) {
        await tx.execute(statement);
      }
      // user_version is part of the DB header and is transactional — it rolls back with the
      // migration on failure. It cannot be bound, so the trusted integer is interpolated.
      await tx.execute(`PRAGMA user_version = ${migration.version}`);
    });
  }

  return {
    from: current,
    to: pending.length ? pending[pending.length - 1].version : current,
    applied: pending.length,
  };
}
