// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate, type Migration } from "./migrate";
import { migrations as registered } from "./migrations";

const dummyV2: Migration = {
  version: 2,
  name: "dummy-probe-table",
  sql: "CREATE TABLE IF NOT EXISTS _probe (id TEXT PRIMARY KEY)",
};

describe("schema evolution: idempotency, version bump, refuse-newer (FR-007/FR-008; SC-004/SC-005)", () => {
  it("is idempotent — a second migrate() with nothing pending applies 0", async () => {
    const db = NodeSqlExecutor.open();
    const first = await migrate(db);
    expect(first.applied).toBe(1);

    const second = await migrate(db);
    expect(second).toEqual({ from: 1, to: 1, applied: 0 });
  });

  it("applies only the newly-registered migration on a version bump (1 → 2)", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db); // at v1

    const result = await migrate(db, [...registered, dummyV2]);
    expect(result).toEqual({ from: 1, to: 2, applied: 1 });

    const uv = await db.select<{ user_version: number }>("PRAGMA user_version");
    expect(uv[0].user_version).toBe(2);

    const probe = await db.select("SELECT name FROM sqlite_master WHERE name = '_probe'");
    expect(probe).toHaveLength(1);
  });

  it("refuses to operate on a store newer than the app knows about", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db, [...registered, dummyV2]); // store advanced to v2

    // An older build that only knows v1 must refuse rather than risk corruption.
    await expect(migrate(db, registered)).rejects.toThrow(/newer/i);
  });
});
