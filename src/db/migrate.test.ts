// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate } from "./migrate";

const ALL_TABLES = [
  "domains",
  "campaigns",
  "courses",
  "milestones",
  "projects",
  "sessions",
  "cards",
  "reviews",
  "streaks",
  "pretest_responses",
  "resources",
  "course_resources",
  "session_assignments",
  "card_resources",
  "project_milestones",
  "project_resources",
  "vault_writes",
  "settings", // Feature 006 (migration m0002)
  "vaults", // Feature 009 (migration m0003)
  "session_card_drafts", // Feature 012 (migration m0006)
];

describe("migrate — fresh apply (FR-007 / SC-001)", () => {
  it("takes user_version 0 → 6 and creates all 20 tables", async () => {
    const db = NodeSqlExecutor.open();

    const before = await db.select<{ user_version: number }>("PRAGMA user_version");
    expect(before[0].user_version).toBe(0);

    const result = await migrate(db);
    expect(result).toEqual({ from: 0, to: 6, applied: 6 }); // + m0006 (Feature 012, session lifecycle)

    const after = await db.select<{ user_version: number }>("PRAGMA user_version");
    expect(after[0].user_version).toBe(6);

    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name).sort()).toEqual([...ALL_TABLES].sort());
  });
});
