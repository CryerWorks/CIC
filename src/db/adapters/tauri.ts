import Database from "@tauri-apps/plugin-sql";
import type { SqlExecutor, SqlValue, ExecuteResult } from "../executor";

/**
 * Production `SqlExecutor` adapter — the ONLY file in the codebase that imports
 * `@tauri-apps/plugin-sql` (Constitution IV; enforced by the `no-restricted-imports`
 * ESLint rule that confines the plugin to `src/db/adapters/**`). Cannot run under
 * Vitest/jsdom — it calls into the Rust runtime — which is exactly why the seam exists.
 */
export class TauriSqlExecutor implements SqlExecutor {
  private constructor(private readonly db: Database) {}

  /** Load (and create on first run) the local store. `connection` resolves to a file in the
   *  OS app-config directory under the app identifier. */
  static async load(connection = "sqlite:cic.db"): Promise<TauriSqlExecutor> {
    const db = await Database.load(connection);
    return new TauriSqlExecutor(db);
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<ExecuteResult> {
    const r = await this.db.execute(sql, params);
    return { rowsAffected: r.rowsAffected, lastInsertId: r.lastInsertId };
  }

  select<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.select<T[]>(sql, params);
  }

  // NOTE (known limitation): tauri-plugin-sql backs SQLite with an sqlx connection *pool*,
  // so BEGIN/COMMIT issued across separate execute() calls are not guaranteed to land on the
  // same connection. For 003 the only transactional path at runtime is the startup migration,
  // which runs once with no concurrent writer; the v1 DDL is also written with IF NOT EXISTS so
  // a partial-then-retried apply is safe. The node test adapter gives true atomicity, so the
  // rollback/lossless guarantees are verified there. Revisit (single pinned connection) when a
  // feature needs multi-statement runtime transactions.
  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    await this.db.execute("BEGIN");
    try {
      const result = await fn(this);
      await this.db.execute("COMMIT");
      return result;
    } catch (err) {
      await this.db.execute("ROLLBACK");
      throw err;
    }
  }
}
