// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { NodeSqlExecutor } from "../../db/adapters/node";
import { migrate } from "../../db/migrate";

describe("m0009 rag migration", () => {
  let db: NodeSqlExecutor;

  beforeAll(async () => {
    db = NodeSqlExecutor.open();
    await migrate(db);
  });

  it("sets user_version to 11 after all migrations", async () => {
    const [{ user_version }] = (await db.select("PRAGMA user_version")) as { user_version: number }[];
    expect(user_version).toBe(11);
  });

  it("creates chunks table with correct schema", async () => {
    type Col = { cid: number; name: string; type: string };
    const cols: Col[] = (await db.select("PRAGMA table_info('chunks')")) as Col[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("vault_id");
    expect(names).toContain("source_kind");
    expect(names).toContain("source_id");
    expect(names).toContain("source_title");
    expect(names).toContain("chunk_index");
    expect(names).toContain("heading_path");
    expect(names).toContain("text_content");
    expect(names).toContain("content_hash");
    expect(names).toContain("char_offset_start");
    expect(names).toContain("char_offset_end");
    expect(names).toContain("created_at");
  });

  it("creates resource_map table", async () => {
    type Col = { name: string };
    const cols: Col[] = (await db.select("PRAGMA table_info('resource_map')")) as Col[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("chunk_id");
    expect(names).toContain("resource_id");
    expect(names).toContain("milestone_id");
    expect(names).toContain("locator");
  });

  it("creates indexed_notes table", async () => {
    type Col = { name: string };
    const cols: Col[] = (await db.select("PRAGMA table_info('indexed_notes')")) as Col[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("vault_id");
    expect(names).toContain("note_path");
    expect(names).toContain("title");
    expect(names).toContain("chunk_count");
    expect(names).toContain("last_indexed_at");
  });

  it("enforces source_kind CHECK constraint", async () => {
    // node:sqlite throws synchronously on constraint violations, not via rejected promise
    expect(() =>
      db.execute(
        `INSERT INTO chunks (id, vault_id, source_kind, source_id, source_title, chunk_index,
         text_content, content_hash, char_offset_start, char_offset_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["test-id", "v1", "invalid", "s1", "title", 0, "text", "a".repeat(64), 0, 4],
      ),
    ).toThrow();
  });

  it("accepts valid source_kind values", async () => {
    // Create minimal vault row for FK reference
    await db.execute(
      "INSERT OR IGNORE INTO vaults (id, path, created_at) VALUES (?, ?, ?)",
      ["v1", "/test", new Date().toISOString()],
    );
    await db.execute(
      `INSERT INTO chunks (id, vault_id, source_kind, source_id, source_title, chunk_index,
       text_content, content_hash, char_offset_start, char_offset_end)
       VALUES (?, ?, 'resource', ?, ?, ?, ?, ?, ?, ?)`,
      [
        "test-resource", "v1", "s1", "title", 0,
        "text", "a".repeat(64), 0, 4,
      ],
    );
    await db.execute(
      `INSERT INTO chunks (id, vault_id, source_kind, source_id, source_title, chunk_index,
       text_content, content_hash, char_offset_start, char_offset_end)
       VALUES (?, ?, 'note', ?, ?, ?, ?, ?, ?, ?)`,
      [
        "test-note", "v1", "s2", "note title", 0,
        "text", "b".repeat(64), 0, 4,
      ],
    );
  });

  it("cascade deletes chunks when vault is deleted", async () => {
    await db.execute("DELETE FROM vaults WHERE id = 'v1'");
    const rows = await db.select("SELECT id FROM chunks WHERE vault_id = 'v1'");
    expect(rows).toHaveLength(0);
  });

  it("has indexes on chunks table", async () => {
    // Verify indexes exist (PRAGMA index_list or check existing index names)
    type Idx = { name: string };
    const idxList: Idx[] = (await db.select(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'chunks'",
    )) as Idx[];
    const names = idxList.map((i) => i.name);
    expect(names).toContain("idx_chunks_vault");
    expect(names).toContain("idx_chunks_source");
  });
});
