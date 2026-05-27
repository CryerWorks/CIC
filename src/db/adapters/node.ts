import { DatabaseSync } from "node:sqlite";
import type { SqlExecutor, SqlValue, ExecuteResult } from "../executor";

/**
 * Test-only `SqlExecutor` adapter over Node 24's built-in `node:sqlite` (research R3).
 * Imported by tests **only** — never by app code (the app uses `adapters/tauri.ts`). It is
 * real SQLite with the same dialect, so DDL, CHECK constraints, FK enforcement and
 * transactions behave identically to production.
 *
 * `node:sqlite` is synchronous; we satisfy the async `SqlExecutor` contract by returning
 * resolved promises. If it ever proves flaky under Vitest workers, the seam makes swapping
 * to `better-sqlite3` a one-file change.
 */
export class NodeSqlExecutor implements SqlExecutor {
  private constructor(private readonly db: DatabaseSync) {}

  /** Open a database. Defaults to an in-memory store; pass a file path for restart tests.
   *  Sets `PRAGMA foreign_keys = ON` explicitly (the FK test is the canary that it took). */
  static open(path = ":memory:"): NodeSqlExecutor {
    const db = new DatabaseSync(path);
    db.exec("PRAGMA foreign_keys = ON");
    return new NodeSqlExecutor(db);
  }

  execute(sql: string, params: SqlValue[] = []): Promise<ExecuteResult> {
    const stmt = this.db.prepare(sql);
    const r = stmt.run(...params);
    return Promise.resolve({
      rowsAffected: Number(r.changes),
      lastInsertId: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined,
    });
  }

  select<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return Promise.resolve(stmt.all(...params) as T[]);
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    this.db.exec("BEGIN");
    try {
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** Close the underlying handle (used by restart tests to reopen the same file). */
  close(): void {
    this.db.close();
  }
}
