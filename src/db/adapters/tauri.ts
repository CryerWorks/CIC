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

  // tauri-plugin-sql backs SQLite with an sqlx connection *pool* and exposes only single-statement
  // execute()/select() — no transaction or connection-pinning API. Each call does its own
  // pool.acquire() (confirmed in the plugin's wrapper.rs), so BEGIN / COMMIT / ROLLBACK issued as
  // separate execute() calls are NOT guaranteed to land on the same connection. In practice the
  // COMMIT/ROLLBACK hits a connection with no open transaction and raises "cannot commit/rollback
  // - no transaction is active", which both fails the operation AND masks its real outcome — this
  // bricked startup migrations in Feature 010.
  //
  // So on the pooled adapter a transaction is best-effort: run `fn` directly and let each statement
  // autocommit in sequence. Correctness without true atomicity is guaranteed by the callers:
  //   • the migration runner is idempotent and applies `user_version` last, so a partial apply
  //     self-heals on the next launch (see src/db/migrate.ts);
  //   • the only runtime transaction (recordReview) is two sequential local writes — the lone
  //     unprotected case is a process crash in the sub-millisecond gap between them, which on a
  //     single-user local store is acceptable and recoverable.
  // The node test adapter implements a real BEGIN/COMMIT/ROLLBACK, so the atomicity *contract*
  // stays verified in Vitest. If a future feature needs hard runtime atomicity, add a Rust-side
  // command that runs the batch on one pinned pool connection — the seam already isolates this.
  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
