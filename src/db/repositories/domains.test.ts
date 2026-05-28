// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain, listDomains, updateDomain, deleteDomain } from "./domains";

const VID = "vault-1";

const tempFiles: string[] = [];
afterEach(() => {
  for (const f of tempFiles.splice(0)) rmSync(f, { force: true });
});

describe("domains repository — Feature 004 additions (vault-scoped per 009)", () => {
  it("restart durability: a created Domain survives close + reopen (FR-011/SC-004)", async () => {
    const path = join(tmpdir(), `cic-dom-${crypto.randomUUID()}.db`);
    tempFiles.push(path);

    const db1 = NodeSqlExecutor.open(path);
    await migrate(db1);
    await attachVault(db1, { id: VID, path: "/vault" });
    const created = await createDomain(db1, VID, { name: "Persistent", color: "#8b6cef" });
    db1.close();

    const db2 = NodeSqlExecutor.open(path);
    const rows = await listDomains(db2, VID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(created);
    db2.close();
  });

  it("updateDomain changes name + color and rejects a duplicate name", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    const a = await createDomain(db, VID, { name: "Alpha", color: "#8b6cef" });
    const b = await createDomain(db, VID, { name: "Beta", color: "#4c8dff" });

    const updated = await updateDomain(db, a.id, { name: "Alphabet", color: "#44cf6e" });
    expect(updated.name).toBe("Alphabet");
    expect(updated.color).toBe("#44cf6e");
    expect((await listDomains(db, VID)).find((d) => d.id === a.id)?.name).toBe("Alphabet");

    await expect(
      updateDomain(db, b.id, { name: "Alphabet", color: "#4c8dff" }),
    ).rejects.toThrow();
  });

  it("deleteDomain removes the row", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    const d = await createDomain(db, VID, { name: "Temp", color: "#8b6cef" });
    await deleteDomain(db, d.id);
    expect(await listDomains(db, VID)).toHaveLength(0);
  });

  it("scopes by vault — a Domain in vault A is not visible from vault B (FR-004)", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: "A", path: "/A" });
    await attachVault(db, { id: "B", path: "/B" });
    await createDomain(db, "A", { name: "OnlyInA", color: "#8b6cef" });

    expect((await listDomains(db, "A")).map((d) => d.name)).toEqual(["OnlyInA"]);
    expect(await listDomains(db, "B")).toHaveLength(0);
  });
});
