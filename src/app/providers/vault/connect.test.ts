// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { NodeSqlExecutor } from "../../../db/adapters/node";
import { migrate, attachVault } from "../../../db";
import { makeTempVault, type TempVault } from "../../../vault/test-support";
import { createVaultIdentity, type VaultIdentity } from "../../../vault/identity";
import { resolveIdentity } from "./connect";
import type { Vault } from "../../../vault";

/**
 * Connector identity resolution (Feature 009, US3 / FR-001/010). Tested in isolation from the
 * Tauri `invoke` in `createConnector` — `resolveIdentity` is the whole recovery decision.
 */
const vaults: TempVault[] = [];
function tmp(): TempVault {
  const v = makeTempVault();
  vaults.push(v);
  return v;
}
afterEach(() => {
  vaults.forEach((v) => v.cleanup());
  vaults.length = 0;
});

async function freshDb() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

/** Wrap a real VaultIdentity (or a fake) as the minimal Vault the resolver needs. */
const asVault = (identity: VaultIdentity) => ({ identity }) as Vault;

describe("resolveIdentity (US3 · FR-001/010)", () => {
  it("marker present → returns it regardless of the connect path", async () => {
    const db = await freshDb();
    const tv = tmp();
    const identity = createVaultIdentity(tv.fs, tv.vaultPath);
    const { id } = await identity.ensure(); // marker now exists

    const resolved = await resolveIdentity(db, asVault(identity), "/some/other/path");
    expect(resolved).toBe(id);
  });

  it("marker absent + a vaults row matches the path → reuses that id and recreates the marker", async () => {
    const db = await freshDb();
    await attachVault(db, { id: "known-id", path: "/known" });
    const tv = tmp();
    const identity = createVaultIdentity(tv.fs, tv.vaultPath); // no marker yet

    const resolved = await resolveIdentity(db, asVault(identity), "/known");
    expect(resolved).toBe("known-id");
    expect(await identity.read()).toBe("known-id"); // marker recreated
  });

  it("marker absent + no path match → mints a fresh id and writes the marker", async () => {
    const db = await freshDb();
    const tv = tmp();
    const identity = createVaultIdentity(tv.fs, tv.vaultPath);

    const resolved = await resolveIdentity(db, asVault(identity), "/brand-new");
    expect(resolved).toMatch(/[0-9a-f-]{36}/);
    expect(await identity.read()).toBe(resolved);
  });

  it("propagates a marker-write failure (so the connector reports unavailable, never unidentified)", async () => {
    const db = await freshDb();
    const failing: VaultIdentity = {
      read: async () => null,
      ensure: async () => {
        throw new Error("vault is read-only");
      },
      write: async () => {
        throw new Error("vault is read-only");
      },
    };
    await expect(resolveIdentity(db, asVault(failing), "/locked")).rejects.toThrow(/read-only/);
  });
});
