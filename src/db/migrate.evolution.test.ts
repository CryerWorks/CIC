// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate, type Migration } from "./migrate";
import { migrations as registered } from "./migrations";

// A probe migration one past the latest registered version (v7 = m0007 session_curriculum), so it
// never collides with a shipped migration as the real history grows.
const dummyV8: Migration = {
  version: 8,
  name: "dummy-probe-table",
  sql: "CREATE TABLE IF NOT EXISTS _probe (id TEXT PRIMARY KEY)",
};

describe("schema evolution: idempotency, version bump, refuse-newer (FR-007/FR-008; SC-004/SC-005)", () => {
  it("is idempotent — a second migrate() with nothing pending applies 0", async () => {
    const db = NodeSqlExecutor.open();
    const first = await migrate(db);
    expect(first.applied).toBe(7); // m0001 + m0002 + m0003 + m0004 + m0005 + m0006 + m0007

    const second = await migrate(db);
    expect(second).toEqual({ from: 7, to: 7, applied: 0 });
  });

  it("applies only the newly-registered migration on a version bump (7 → 8)", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db); // at v7 (latest registered)

    const result = await migrate(db, [...registered, dummyV8]);
    expect(result).toEqual({ from: 7, to: 8, applied: 1 });

    const uv = await db.select<{ user_version: number }>("PRAGMA user_version");
    expect(uv[0].user_version).toBe(8);

    const probe = await db.select("SELECT name FROM sqlite_master WHERE name = '_probe'");
    expect(probe).toHaveLength(1);
  });

  it("refuses to operate on a store newer than the app knows about", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db, [...registered, dummyV8]); // store advanced to v8

    // An older build that only knows the registered set (latest v7) must refuse, not risk corruption.
    await expect(migrate(db, registered)).rejects.toThrow(/newer/i);
  });
});
