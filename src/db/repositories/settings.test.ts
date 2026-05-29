// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { getSetting, setSetting } from "./settings";

describe("settings repository + m0002 migration (Feature 006 · FR-003/FR-009)", () => {
  it("m0002 applies on top of m0001 and the settings table is usable", async () => {
    const db = NodeSqlExecutor.open();
    const result = await migrate(db);
    expect(result.to).toBe(6); // m0001 + m0002 + m0003 + m0004 + m0005 + m0006

    const table = await db.select(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
    );
    expect(table).toHaveLength(1);
  });

  it("setSetting then getSetting round-trips a value", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await setSetting(db, "vault.path", "C:/Users/me/Vault");
    expect(await getSetting(db, "vault.path")).toBe("C:/Users/me/Vault");
  });

  it("re-setting a key updates in place (no duplicate)", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await setSetting(db, "vault.path", "/old");
    await setSetting(db, "vault.path", "/new");

    expect(await getSetting(db, "vault.path")).toBe("/new");
    const count = await db.select<{ c: number }>("SELECT COUNT(*) AS c FROM settings");
    expect(count[0].c).toBe(1);
  });

  it("getSetting of an unset key returns null", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    expect(await getSetting(db, "nope")).toBeNull();
  });
});
