// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { NodeSqlExecutor } from "../../db/adapters/node";
import { migrate } from "../../db/migrate";

describe("m0010 feynman_gaps migration", () => {
  let db: NodeSqlExecutor;

  beforeAll(async () => {
    db = NodeSqlExecutor.open();
    await migrate(db);
  });

  it("sets user_version to 11 after all migrations", async () => {
    const [{ user_version }] = (await db.select(
      "PRAGMA user_version",
    )) as { user_version: number }[];
    expect(user_version).toBe(11);
  });

  it("creates feynman_gaps table with correct schema", async () => {
    type Col = { name: string };
    const cols: Col[] = (await db.select(
      "PRAGMA table_info('feynman_gaps')",
    )) as Col[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("vault_id");
    expect(names).toContain("course_id");
    expect(names).toContain("note_path");
    expect(names).toContain("text");
    expect(names).toContain("status");
    expect(names).toContain("created_at");
  });

  it("creates vault index", async () => {
    type Idx = { name: string };
    const indexes: Idx[] = (await db.select(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'feynman_gaps'",
    )) as Idx[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_feynman_gaps_vault");
    expect(names).toContain("idx_feynman_gaps_course");
  });

  it("enforces status CHECK constraint", () => {
    expect(() =>
      db.execute(
        "INSERT INTO feynman_gaps (id, vault_id, note_path, text, status) VALUES ('1', 'fake', 'n.md', 'test', 'invalid')",
      ),
    ).toThrow();
  });
});
