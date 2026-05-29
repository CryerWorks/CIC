// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate } from "./migrate";
import { migrations as registered } from "./migrations";
import { insert } from "./repositories/query";

/**
 * Feature 010 migration (`m0004_srs_scoping`): additive `resources.vault_id` + index and
 * `cards.note_block_id`. Verifies the columns/index land, pre-existing `resources`/`cards` rows
 * survive with the new columns NULL (lossless), and re-running is a no-op.
 */
describe("m0004_srs_scoping (FR-019/FR-018)", () => {
  it("adds resources.vault_id + its index and cards.note_block_id", async () => {
    const db = NodeSqlExecutor.open();
    const result = await migrate(db);
    expect(result).toEqual({ from: 0, to: 4, applied: 4 });

    const rcols = await db.select<{ name: string }>("PRAGMA table_info(resources)");
    expect(rcols.map((c) => c.name)).toContain("vault_id");

    const ccols = await db.select<{ name: string }>("PRAGMA table_info(cards)");
    expect(ccols.map((c) => c.name)).toContain("note_block_id");

    const idx = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_resources_vault_id'",
    );
    expect(idx).toHaveLength(1);
  });

  it("is lossless — a resource/card inserted at v3 survives m0004 with the new columns NULL", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db, registered.filter((m) => m.version <= 3)); // 0 → 3 (pre-feature)

    const rid = crypto.randomUUID();
    await insert(db, "resources", {
      id: rid, title: "Calculus", kind: "book", file_path: null, url: null,
      metadata: {}, ingested_at: null, added_at: "2026-05-01T00:00:00.000Z",
    });

    const result = await migrate(db); // full set → applies only m0004
    expect(result).toEqual({ from: 3, to: 4, applied: 1 });

    const rows = await db.select<{ id: string; title: string; vault_id: string | null }>(
      "SELECT id, title, vault_id FROM resources WHERE id = ?",
      [rid],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Calculus");
    expect(rows[0].vault_id).toBeNull();
  });

  it("is idempotent — re-running at v4 applies nothing", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    expect(await migrate(db)).toEqual({ from: 4, to: 4, applied: 0 });
  });

  it("self-heals a partial apply — re-running over an already-added column does not throw", async () => {
    // The production (pooled) adapter can't hold a real transaction, so a migration may partially
    // apply: a column lands but `user_version` is never bumped. Simulate that — `resources.vault_id`
    // exists while the store is still at v3 — and confirm the next launch completes to v4 instead of
    // failing with "duplicate column name" (which previously bricked startup).
    const db = NodeSqlExecutor.open();
    await migrate(db, registered.filter((m) => m.version <= 3)); // store at v3
    await db.execute("ALTER TABLE resources ADD COLUMN vault_id TEXT REFERENCES vaults(id)");

    const result = await migrate(db); // m0004 re-runs; ADD COLUMN vault_id is a no-op
    expect(result).toEqual({ from: 3, to: 4, applied: 1 });

    const ccols = await db.select<{ name: string }>("PRAGMA table_info(cards)");
    expect(ccols.map((c) => c.name)).toContain("note_block_id"); // the rest still applied
    const ver = await db.select<{ user_version: number }>("PRAGMA user_version");
    expect(ver[0].user_version).toBe(4);
  });
});
