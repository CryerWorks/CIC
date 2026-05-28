// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { readdirSync } from "node:fs";
import { VaultPathError } from "./errors";
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

const UNSAFE = ["../escape.md", "/abs/evil.md", ".obsidian/app.json", "Math/../../x.md"];

describe("path boundary at the public surface (US3 · FR-011/012 · SC-006)", () => {
  it("writer rejects every unsafe path before any I/O — nothing is created", async () => {
    const { writer, vaultPath } = vault();
    for (const bad of UNSAFE) {
      await expect(
        writer.writeNote(bad, { frontmatter: {}, body: "x\n" }),
      ).rejects.toBeInstanceOf(VaultPathError);
    }
    expect(readdirSync(vaultPath)).toHaveLength(0); // no file or folder leaked into the vault
  });

  it("reader rejects unsafe paths on read / exists / list", async () => {
    const { reader } = vault();
    await expect(reader.readNote("../x.md")).rejects.toBeInstanceOf(VaultPathError);
    await expect(reader.exists(".obsidian/app.json")).rejects.toBeInstanceOf(VaultPathError);
    await expect(reader.list("../..")).rejects.toBeInstanceOf(VaultPathError);
  });

  it("a valid subfolder path round-trips", async () => {
    const { reader, writer } = vault();
    await writer.writeNote("Notes/Deep/ok.md", { frontmatter: { title: "ok" }, body: "fine\n" });
    expect(await reader.exists("Notes/Deep/ok.md")).toBe(true);
  });
});
