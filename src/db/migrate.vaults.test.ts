// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate } from "./migrate";
import { migrations as registered } from "./migrations";
import { insert } from "./repositories/query";

/**
 * Feature 009 migration (`m0003_vaults`): additive `vaults` table + nullable `domains.vault_id`
 * + index. Verifies the schema lands, pre-existing rows survive with `vault_id` NULL (lossless),
 * and re-running is a no-op. (Adoption of the NULL rows is a runtime concern — tested in the
 * vaults repo, not the migration.)
 */
describe("m0003_vaults (FR-003/FR-008)", () => {
  it("creates the vaults table, adds domains.vault_id, and the index", async () => {
    const db = NodeSqlExecutor.open();
    const result = await migrate(db, registered.filter((m) => m.version <= 3)); // up to m0003
    expect(result).toEqual({ from: 0, to: 3, applied: 3 });

    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='vaults'",
    );
    expect(tables).toHaveLength(1);

    const cols = await db.select<{ name: string }>("PRAGMA table_info(domains)");
    expect(cols.map((c) => c.name)).toContain("vault_id");

    const idx = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_domains_vault_id'",
    );
    expect(idx).toHaveLength(1);
  });

  it("is lossless — a domain inserted at v2 survives m0003 with vault_id NULL", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db, registered.filter((m) => m.version <= 2)); // 0 → 2 (pre-feature)

    const id = crypto.randomUUID();
    await insert(db, "domains", { id, name: "Physics", color: "#00bfbc" });

    const result = await migrate(db, registered.filter((m) => m.version <= 3)); // → applies only m0003
    expect(result).toEqual({ from: 2, to: 3, applied: 1 });

    const rows = await db.select<{ id: string; name: string; vault_id: string | null }>(
      "SELECT id, name, vault_id FROM domains WHERE id = ?",
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Physics");
    expect(rows[0].vault_id).toBeNull();
  });

  it("is idempotent — re-running at v3 applies nothing", async () => {
    const db = NodeSqlExecutor.open();
    const upToV3 = registered.filter((m) => m.version <= 3);
    await migrate(db, upToV3);
    const again = await migrate(db, upToV3);
    expect(again).toEqual({ from: 3, to: 3, applied: 0 });
  });
});
