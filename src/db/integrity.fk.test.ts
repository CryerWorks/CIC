// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate } from "./migrate";
import { insert } from "./repositories/query";

async function freshDb() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

describe("foreign-key enforcement (FR-003/SC-003)", () => {
  it("rejects inserting a child whose parent does not exist", async () => {
    const db = await freshDb();

    // campaign → missing domain
    await expect(
      insert(db, "campaigns", { id: crypto.randomUUID(), title: "x", domain_id: "missing" }),
    ).rejects.toThrow();

    // milestone → missing course
    await expect(
      insert(db, "milestones", {
        id: crypto.randomUUID(),
        course_id: "missing",
        capability: "x",
        status: "todo",
        order_index: 0,
      }),
    ).rejects.toThrow();

    // review → missing card
    await expect(
      insert(db, "reviews", {
        id: crypto.randomUUID(),
        card_id: "missing",
        rating: "good",
        confidence: null,
        reviewed_at: "2026-05-27T00:00:00.000Z",
        elapsed_ms: null,
      }),
    ).rejects.toThrow();

    // M:N join row → both ends missing
    await expect(
      insert(db, "course_resources", {
        course_id: "missing",
        resource_id: "missing",
        role: "primary",
      }),
    ).rejects.toThrow();
  });

  it("confirms PRAGMA foreign_keys is actually ON (the canary)", async () => {
    const db = await freshDb();
    const rows = await db.select<{ foreign_keys: number }>("PRAGMA foreign_keys");
    expect(rows[0].foreign_keys).toBe(1);
  });
});
