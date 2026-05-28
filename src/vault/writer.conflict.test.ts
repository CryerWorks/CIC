// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
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

describe("never-clobber conflict detection (US2 · FR-005/006/007/008/009 · SC-003/004)", () => {
  it("refuses a write after an external edit and leaves the file untouched (SC-003)", async () => {
    const { writer, vaultPath } = vault();
    await writer.writeNote("n.md", { frontmatter: { title: "A" }, body: "original\n" });

    // Simulate Obsidian editing the file out-of-band.
    const abs = join(vaultPath, "n.md");
    const external = "---\ntitle: A\n---\nEDITED IN OBSIDIAN\n";
    writeFileSync(abs, external);

    const res = await writer.writeNote("n.md", {
      frontmatter: { title: "A" },
      body: "app overwrite attempt\n",
    });

    expect(res.status).toBe("conflict");
    if (res.status === "conflict") {
      expect(res.reason).toBe("drifted");
      expect(res.recorded).toBeDefined();
    }
    expect(readFileSync(abs, "utf8")).toBe(external); // file left exactly as the external edit
  });

  it("writes an unchanged managed note and advances the recorded fingerprint (SC-004)", async () => {
    const { writer, log } = vault();
    const r1 = await writer.writeNote("n.md", { frontmatter: {}, body: "v1\n" });
    expect(r1.status).toBe("written");
    const fp1 = await log.get("n.md");

    const r2 = await writer.writeNote("n.md", { frontmatter: {}, body: "v2 content\n" });
    expect(r2.status).toBe("written");
    const fp2 = await log.get("n.md");

    expect(fp2).not.toEqual(fp1); // fingerprint advanced
  });

  it("treats an unmanaged on-disk file as a conflict — never silently overwritten (FR-009)", async () => {
    const { writer, vaultPath } = vault();
    writeFileSync(join(vaultPath, "external.md"), "---\ntitle: Z\n---\nmade by hand\n");

    const res = await writer.writeNote("external.md", { frontmatter: { title: "Z" }, body: "app\n" });
    expect(res.status).toBe("conflict");
    if (res.status === "conflict") expect(res.reason).toBe("unmanaged");
  });

  it("overwrite:true writes despite a conflict and records the new fingerprint (FR-007)", async () => {
    const { writer, log, vaultPath } = vault();
    writeFileSync(join(vaultPath, "external.md"), "hand-made\n");

    const res = await writer.writeNote(
      "external.md",
      { frontmatter: {}, body: "forced overwrite\n" },
      { overwrite: true },
    );
    expect(res.status).toBe("written");
    expect(await log.get("external.md")).not.toBeNull(); // fingerprint now recorded
  });
});
