/**
 * The `SqlExecutor` seam (Constitution IV — thin interface, deep adapters).
 *
 * Every higher layer (migration runner, repositories, models) is built on this and never
 * touches `@tauri-apps/plugin-sql` directly. Two deep adapters implement it identically:
 *   • `adapters/tauri.ts` — production (the ONLY importer of the plugin)
 *   • `adapters/node.ts`  — tests, via Node's built-in `node:sqlite`
 *
 * This is what makes the data-integrity behaviours (migrations, FK enforcement, round-trips,
 * validation) unit-testable in Vitest against real SQLite without the Tauri runtime.
 */

/** The only value types that cross the SQLite boundary. Higher layers encode booleans → 0/1
 *  and objects/arrays → JSON text before binding (see `repositories/query.ts`). */
export type SqlValue = string | number | null;

/** Result of a write/DDL statement. */
export interface ExecuteResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface SqlExecutor {
  /** Run a single write/DDL statement. Parameterized via positional `?` placeholders. */
  execute(sql: string, params?: SqlValue[]): Promise<ExecuteResult>;
  /** Run a single query; returns raw rows (callers parse via zod). */
  select<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Run `fn` inside a transaction; commit on resolve, roll back on throw. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

// Placeholder convention: positional `?`. Both adapters bind it the same way (sqlx and
// node:sqlite both accept anonymous positional parameters), so one SQL string works on
// both. Never string-interpolate values — injection + correctness (the lone exception is
// `PRAGMA user_version = <int>`, which cannot be bound and only ever takes a trusted
// integer from a registered migration).
