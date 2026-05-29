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

/** Our own controlled `ALTER TABLE <table> ADD COLUMN <column> ...` DDL. SQLite has no
 *  `ADD COLUMN IF NOT EXISTS`, and the production (pooled) adapter cannot wrap a migration in a
 *  real transaction (see adapters/tauri.ts), so a migration can partially apply — re-running on the
 *  next launch must not fail with "duplicate column name". Table/column are bare identifiers from
 *  our migrations (never user input), so interpolating them into the un-bindable PRAGMA is safe. */
const ADD_COLUMN_RE = /^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\b/i;

async function columnExists(db: SqlExecutor, table: string, column: string): Promise<boolean> {
  const cols = await db.select<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

/** SQLite's "duplicate column name: X" — raised by `ADD COLUMN` when the column already exists. */
function isDuplicateColumnError(e: unknown): boolean {
  return /duplicate column name/i.test(e instanceof Error ? e.message : String(e));
}

/** Apply one migration statement idempotently. `CREATE TABLE`/`CREATE INDEX` already use
 *  `IF NOT EXISTS`; the only non-idempotent DDL we emit is `ADD COLUMN`. We guard it with a
 *  `PRAGMA table_info` existence check AND swallow a "duplicate column name" error: the production
 *  pooled adapter can partially apply a migration (no real transaction — see adapters/tauri.ts), and
 *  `tauri-plugin-sql`'s `select` does not reliably return rows for `PRAGMA table_info`, so the
 *  existence check alone can wrongly say "absent" and re-add an existing column. Catching the
 *  duplicate-column error makes the re-run on the next launch self-heal regardless. */
async function applyStatement(tx: SqlExecutor, statement: string): Promise<void> {
  const addColumn = ADD_COLUMN_RE.exec(statement);
  if (addColumn) {
    if (await columnExists(tx, addColumn[1], addColumn[2])) return;
    try {
      await tx.execute(statement);
    } catch (e) {
      if (isDuplicateColumnError(e)) return; // already added by an earlier partial apply
      throw e;
    }
    return;
  }
  await tx.execute(statement);
}

/**
 * Forward-only migration runner (contracts/migration-contract.md).
 *
 * Reads `PRAGMA user_version`; applies every registered migration with `version > current`
 * in ascending order, each inside a transaction that bumps `user_version` last; idempotent
 * when nothing is pending. Throws if the store's version exceeds the latest known migration
 * (refuse newer-than-app — an older build must not operate on a newer store).
 *
 * Each statement is applied idempotently (see `applyStatement`), and `user_version` is bumped
 * only after they all succeed. The production adapter's pooled connection cannot guarantee a real
 * transaction (see adapters/tauri.ts), so a migration may partially apply; this self-corrects on
 * the next launch — already-applied statements become no-ops — without bricking the store.
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
        await applyStatement(tx, statement);
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
