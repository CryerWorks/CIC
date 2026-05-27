// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { recordVaultWrite, getVaultWrite } from "./vaultWrites";

describe("vault_writes repository (Feature 005 addition · FR-008)", () => {
  it("record then get round-trips the fingerprint", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await recordVaultWrite(db, "Math/RA.md", {
      mtime: "2026-05-27T10:00:00.000Z",
      hash: "abc123",
    });
    expect(await getVaultWrite(db, "Math/RA.md")).toEqual({
      file_path: "Math/RA.md",
      app_mtime: "2026-05-27T10:00:00.000Z",
      app_hash: "abc123",
    });
  });

  it("re-recording the same file_path updates in place (no duplicate)", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await recordVaultWrite(db, "n.md", { mtime: "t1", hash: "h1" });
    await recordVaultWrite(db, "n.md", { mtime: "t2", hash: "h2" });

    expect(await getVaultWrite(db, "n.md")).toEqual({
      file_path: "n.md",
      app_mtime: "t2",
      app_hash: "h2",
    });
    const count = await db.select<{ c: number }>("SELECT COUNT(*) AS c FROM vault_writes");
    expect(count[0].c).toBe(1);
  });

  it("get returns null for an unmanaged path", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    expect(await getVaultWrite(db, "ghost.md")).toBeNull();
  });
});
