// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate } from "./migrate";
import { seedFullGraph } from "./test-fixtures";
import { insert, selectParsed } from "./repositories/query";
import { StreakSchema } from "./models/streak";

async function setup() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  const ids = await seedFullGraph(db);
  return { db, ids };
}

describe("validation rejects bad data with no partial write (FR-004/SC-003)", () => {
  it("rejects an out-of-enum status (DB CHECK)", async () => {
    const { db, ids } = await setup();
    await expect(
      insert(db, "milestones", {
        id: crypto.randomUUID(),
        course_id: ids.courseId,
        capability: "bad status",
        status: "frozen", // not in milestone_status
        order_index: 9,
      }),
    ).rejects.toThrow();
  });

  it("rejects out-of-range confidence (DB CHECK: 1..5)", async () => {
    const { db, ids } = await setup();
    await expect(
      insert(db, "reviews", {
        id: crypto.randomUUID(),
        card_id: ids.cardId,
        rating: "good",
        confidence: 6, // out of range
        reviewed_at: "2026-05-27T11:00:00.000Z",
        elapsed_ms: null,
      }),
    ).rejects.toThrow();
  });

  it("rejects a malformed JSON column on read (zod), without crashing", async () => {
    const { db } = await setup();
    // Write invalid JSON directly, bypassing the encoder, to simulate a corrupt/hand-edited row.
    await db.execute(
      "INSERT INTO streaks (date, minutes, domains_touched) VALUES (?, ?, ?)",
      ["2020-01-01", 0, "{not valid json"],
    );
    await expect(
      selectParsed(db, StreakSchema, "SELECT * FROM streaks WHERE date = ?", ["2020-01-01"]),
    ).rejects.toThrow();
  });

  it("leaves no partial row when a write is rejected", async () => {
    const { db, ids } = await setup();
    const countBefore = await db.select<{ n: number }>(
      "SELECT COUNT(*) AS n FROM milestones WHERE course_id = ?",
      [ids.courseId],
    );
    await expect(
      insert(db, "milestones", {
        id: crypto.randomUUID(),
        course_id: ids.courseId,
        capability: "rejected",
        status: "nonsense",
        order_index: 1,
      }),
    ).rejects.toThrow();
    const countAfter = await db.select<{ n: number }>(
      "SELECT COUNT(*) AS n FROM milestones WHERE course_id = ?",
      [ids.courseId],
    );
    expect(countAfter[0].n).toBe(countBefore[0].n);
  });
});
