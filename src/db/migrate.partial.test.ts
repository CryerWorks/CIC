import { describe, it, expect } from "vitest";
import { migrate, type Migration } from "./migrate";
import type { SqlExecutor, ExecuteResult } from "./executor";

/**
 * Regression for the production migration brick (Feature 012): the pooled `tauri-plugin-sql` adapter
 * (1) can't run a real transaction, so a migration can **partially apply** (a column added, but
 * `user_version` not yet bumped), and (2) doesn't reliably return rows for `PRAGMA table_info`, so
 * the runner's `columnExists` guard wrongly reports the column absent and re-issues `ADD COLUMN` —
 * which SQLite rejects with "duplicate column name". The runner must swallow that and self-heal.
 */
class FlakyIntrospectionExecutor implements SqlExecutor {
  private version = 0;
  /** Columns that already exist (simulating an earlier partial apply). */
  constructor(private readonly existing: Set<string>) {}

  select<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    if (/PRAGMA user_version/i.test(sql)) return Promise.resolve([{ user_version: this.version } as unknown as T]);
    // The production bug: table_info yields no rows, so columnExists can't see existing columns.
    return Promise.resolve([]);
  }

  execute(sql: string): Promise<ExecuteResult> {
    const setVersion = /PRAGMA user_version\s*=\s*(\d+)/i.exec(sql);
    if (setVersion) {
      this.version = Number(setVersion[1]);
      return Promise.resolve({ rowsAffected: 0 });
    }
    const add = /ADD COLUMN (\w+)/i.exec(sql);
    if (add && this.existing.has(add[1])) {
      return Promise.reject(new Error(`duplicate column name: ${add[1]}`));
    }
    if (add) this.existing.add(add[1]);
    return Promise.resolve({ rowsAffected: 0 });
  }

  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const migration: Migration = {
  version: 1,
  name: "add-columns",
  sql: "ALTER TABLE sessions ADD COLUMN status TEXT; ALTER TABLE sessions ADD COLUMN completed_at TEXT",
};

describe("migrate — self-heals a partial ADD COLUMN apply (Feature 012 production fix)", () => {
  it("does not throw 'duplicate column name' when a column from a partial apply already exists", async () => {
    // `status` was added by a prior partial apply; `completed_at` was not. Introspection sees neither.
    const db = new FlakyIntrospectionExecutor(new Set(["status"]));

    const result = await migrate(db, [migration]);

    expect(result).toEqual({ from: 0, to: 1, applied: 1 });
    const v = await db.select<{ user_version: number }>("PRAGMA user_version");
    expect(v[0].user_version).toBe(1); // reached the target version despite the duplicate column
  });

  it("still propagates a non-duplicate execute error", async () => {
    class Boom extends FlakyIntrospectionExecutor {
      execute(sql: string): Promise<ExecuteResult> {
        if (/ADD COLUMN/i.test(sql)) return Promise.reject(new Error("disk I/O error"));
        return super.execute(sql);
      }
    }
    await expect(migrate(new Boom(new Set()), [migration])).rejects.toThrow(/disk I\/O/);
  });
});
