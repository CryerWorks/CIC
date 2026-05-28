// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { makeTempVault, type TempVault } from "./test-support";
import { createVaultIdentity, VAULT_MARKER_PATH } from "./identity";

/**
 * Constitution I watch-item: the identity marker is a new vault-write surface. These verify it is
 * created atomically through the vault layer, is idempotent, tolerates absence/garbage, and never
 * surfaces as a Note (`.md`) — i.e. it stays hidden CIC metadata (FR-002/009).
 */
let vaults: TempVault[] = [];
function tmp(): TempVault {
  const v = makeTempVault();
  vaults.push(v);
  return v;
}
afterEach(() => {
  vaults.forEach((v) => v.cleanup());
  vaults = [];
});

const markerAbs = (vaultPath: string) => join(vaultPath, ".cic", "vault.json");

describe("VaultIdentity (FR-001/002/009)", () => {
  it("ensure() on a fresh vault creates the marker and read() returns the same id", async () => {
    const { fs, vaultPath } = tmp();
    const id = createVaultIdentity(fs, vaultPath);

    const first = await id.ensure();
    expect(first.created).toBe(true);
    expect(first.id).toMatch(/[0-9a-f-]{36}/);
    expect(await id.read()).toBe(first.id);
    expect(await fs.exists(markerAbs(vaultPath))).toBe(true);
  });

  it("ensure() is idempotent — same id, created:false, file unchanged", async () => {
    const { fs, vaultPath } = tmp();
    const id = createVaultIdentity(fs, vaultPath);
    const first = await id.ensure();
    const before = await fs.readTextFile(markerAbs(vaultPath));

    const second = await id.ensure();
    expect(second).toEqual({ id: first.id, created: false });
    expect(await fs.readTextFile(markerAbs(vaultPath))).toBe(before); // byte-identical, no rewrite
  });

  it("writes atomically — no leftover *.cic-tmp artifact", async () => {
    const { fs, vaultPath } = tmp();
    await createVaultIdentity(fs, vaultPath).ensure();
    const entries = readdirSync(join(vaultPath, ".cic"));
    expect(entries).toEqual(["vault.json"]);
    expect(entries.some((e) => e.includes("cic-tmp"))).toBe(false);
  });

  it("read() returns null for an absent or malformed marker", async () => {
    const { fs, vaultPath } = tmp();
    const id = createVaultIdentity(fs, vaultPath);
    expect(await id.read()).toBeNull(); // absent

    await fs.mkdir(join(vaultPath, ".cic"), { recursive: true });
    await fs.writeTextFile(markerAbs(vaultPath), "not json at all");
    expect(await id.read()).toBeNull(); // malformed
  });

  it("write(id) persists exactly that id (recovery path)", async () => {
    const { fs, vaultPath } = tmp();
    const id = createVaultIdentity(fs, vaultPath);
    await id.write("11111111-1111-4111-8111-111111111111");
    expect(await id.read()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("never surfaces as a Note — the marker is not in reader.list()", async () => {
    const { fs, vaultPath, reader } = tmp();
    await createVaultIdentity(fs, vaultPath).ensure();
    const notes = await reader.list();
    expect(notes).not.toContain(VAULT_MARKER_PATH);
    expect(notes).toHaveLength(0); // no `.md` written at all
  });
});
