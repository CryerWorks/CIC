// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate, type Migration } from "./migrate";
import { migrations as registered } from "./migrations";

// A probe migration one past the latest registered version (v16 = m0016 session_source_details), so it
// never collides with a shipped migration as the real history grows.
const dummyV17: Migration = {
  version: 17,
  name: "dummy-probe-table",
  sql: "CREATE TABLE IF NOT EXISTS _probe (id TEXT PRIMARY KEY)",
};

describe("schema evolution: idempotency, version bump, refuse-newer (FR-007/FR-008; SC-004/SC-005)", () => {
  it("is idempotent — a second migrate() with nothing pending applies 0", async () => {
    const db = NodeSqlExecutor.open();
    const first = await migrate(db);
    expect(first.applied).toBe(16); // m0001–m0016

    const second = await migrate(db);
    expect(second).toEqual({ from: 16, to: 16, applied: 0 });
  });

  it("applies only the newly-registered migration on a version bump (16 → 17)", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db); // at v16 (latest registered)

    const result = await migrate(db, [...registered, dummyV17]);
    expect(result).toEqual({ from: 16, to: 17, applied: 1 });

    const uv = await db.select<{ user_version: number }>("PRAGMA user_version");
    expect(uv[0].user_version).toBe(17);

    const probe = await db.select("SELECT name FROM sqlite_master WHERE name = '_probe'");
    expect(probe).toHaveLength(1);
  });

  it("refuses to operate on a store newer than the app knows about", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db, [...registered, dummyV17]); // store advanced to v17

    // An older build that only knows the registered set (latest v16) must refuse, not risk corruption.
    await expect(migrate(db, registered)).rejects.toThrow(/newer/i);
  });
});
