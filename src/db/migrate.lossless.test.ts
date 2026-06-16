// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate, type Migration } from "./migrate";
import { migrations as registered } from "./migrations";
import { insert } from "./repositories/query";

const addColumnV15: Migration = {
  version: 15, // one past the latest registered (v14 = m0014 session_sources)
  name: "add-domains-icon",
  sql: "ALTER TABLE domains ADD COLUMN icon TEXT",
};

describe("lossless upgrade (FR-008/SC-005)", () => {
  it("preserves rows inserted at the current version when a later migration adds a column", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db); // latest registered (v14)

    const id = crypto.randomUUID();
    await insert(db, "domains", { id, name: "Physics", color: "#00bfbc" });

    const result = await migrate(db, [...registered, addColumnV15]);
    expect(result).toEqual({ from: 14, to: 15, applied: 1 });

    const rows = await db.select<{ id: string; name: string; color: string; icon: string | null }>(
      "SELECT * FROM domains WHERE id = ?",
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Physics");
    expect(rows[0].color).toBe("#00bfbc");
    expect(rows[0].icon).toBeNull(); // new column, back-filled NULL — old row intact
  });
});
