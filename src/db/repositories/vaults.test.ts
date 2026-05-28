// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { insert } from "./query";
import { attachVault, getVault, getVaultByPath } from "./vaults";

async function freshDb() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

describe("vaults repo — attach + adoption (FR-008 / db-scoping 5–7)", () => {
  it("inserts a record and round-trips via getVault", async () => {
    const db = await freshDb();
    await attachVault(db, { id: "v-A", path: "/vaults/A" });

    const row = await getVault(db, "v-A");
    expect(row).not.toBeNull();
    expect(row?.path).toBe("/vaults/A");
    expect(typeof row?.created_at).toBe("string");
    expect(await getVault(db, "missing")).toBeNull();
  });

  it("re-attaching refreshes path only — no duplicate, created_at stable", async () => {
    const db = await freshDb();
    await attachVault(db, { id: "v-A", path: "/vaults/A" });
    const first = await getVault(db, "v-A");

    await attachVault(db, { id: "v-A", path: "/vaults/A-renamed" });
    const after = await getVault(db, "v-A");

    expect(after?.path).toBe("/vaults/A-renamed");
    expect(after?.created_at).toBe(first?.created_at); // unchanged on conflict
    const all = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM vaults");
    expect(all[0].n).toBe(1); // no dup row
  });

  it("first attach adopts NULL domains; a second attach adopts nothing", async () => {
    const db = await freshDb();
    // Two pre-feature domains (vault_id NULL — insert omits the column).
    await insert(db, "domains", { id: "d1", name: "Math", color: "#fff" });
    await insert(db, "domains", { id: "d2", name: "CS", color: "#000" });

    await attachVault(db, { id: "v-A", path: "/vaults/A" });
    const owned = await db.select<{ id: string; vault_id: string | null }>(
      "SELECT id, vault_id FROM domains ORDER BY id",
    );
    expect(owned.map((d) => d.vault_id)).toEqual(["v-A", "v-A"]);

    // A different vault attaches later — no NULLs remain, so it claims nothing.
    await attachVault(db, { id: "v-B", path: "/vaults/B" });
    const still = await db.select<{ id: string; vault_id: string | null }>(
      "SELECT id, vault_id FROM domains ORDER BY id",
    );
    expect(still.map((d) => d.vault_id)).toEqual(["v-A", "v-A"]); // no bleed into B
  });

  it("getVaultByPath finds the row by exact path, else null (recovery lookup, FR-010)", async () => {
    const db = await freshDb();
    await attachVault(db, { id: "v-A", path: "/vaults/A" });
    expect((await getVaultByPath(db, "/vaults/A"))?.id).toBe("v-A");
    expect(await getVaultByPath(db, "/vaults/elsewhere")).toBeNull();
  });
});
