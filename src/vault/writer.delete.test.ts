// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempVault, type TempVault } from "./test-support";

const vaults: TempVault[] = [];
function vault(): TempVault {
  const v = makeTempVault();
  vaults.push(v);
  return v;
}
afterEach(() => {
  for (const v of vaults.splice(0)) v.cleanup();
});

describe("VaultWriter.deleteNote — never-clobber delete (Feature 007)", () => {
  it("deletes a managed note and forgets its fingerprint", async () => {
    const { writer, log, vaultPath } = vault();
    await writer.writeNote("n.md", { frontmatter: { title: "A" }, body: "body\n" });
    expect(await log.get("n.md")).not.toBeNull();

    const res = await writer.deleteNote("n.md");

    expect(res.status).toBe("deleted");
    expect(existsSync(join(vaultPath, "n.md"))).toBe(false);
    expect(await log.get("n.md")).toBeNull(); // path reverts to "unmanaged"
  });

  it("reports `absent` when there is nothing to delete", async () => {
    const { writer } = vault();
    const res = await writer.deleteNote("missing.md");
    expect(res.status).toBe("absent");
  });

  it("refuses to delete a drifted note and leaves it on disk", async () => {
    const { writer, vaultPath } = vault();
    await writer.writeNote("n.md", { frontmatter: { title: "A" }, body: "original\n" });

    const abs = join(vaultPath, "n.md");
    const external = "---\ntitle: A\n---\nEDITED IN OBSIDIAN\n";
    writeFileSync(abs, external);

    const res = await writer.deleteNote("n.md");

    expect(res.status).toBe("conflict");
    if (res.status === "conflict") expect(res.reason).toBe("drifted");
    expect(existsSync(abs)).toBe(true); // never silently removed
  });

  it("refuses to delete an unmanaged file (one the app never wrote)", async () => {
    const { writer, vaultPath } = vault();
    writeFileSync(join(vaultPath, "external.md"), "---\ntitle: Z\n---\nby hand\n");

    const res = await writer.deleteNote("external.md");

    expect(res.status).toBe("conflict");
    if (res.status === "conflict") expect(res.reason).toBe("unmanaged");
    expect(existsSync(join(vaultPath, "external.md"))).toBe(true);
  });

  it("overwrite:true deletes despite a conflict, after explicit confirmation", async () => {
    const { writer, vaultPath } = vault();
    writeFileSync(join(vaultPath, "external.md"), "by hand\n");

    const res = await writer.deleteNote("external.md", { overwrite: true });

    expect(res.status).toBe("deleted");
    expect(existsSync(join(vaultPath, "external.md"))).toBe(false);
  });
});
