// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { makeTempVault, type TempVault } from "../../../vault/test-support";
import { citeNoteParagraph } from "./blockRef";

const vaults: TempVault[] = [];
function tempVault(): TempVault {
  const v = makeTempVault();
  vaults.push(v);
  return v;
}
afterEach(() => {
  for (const v of vaults.splice(0)) v.cleanup();
});

const deps = (tv: TempVault) => ({ reader: tv.reader, writer: tv.writer });

describe("citeNoteParagraph (F3.6)", () => {
  it("inserts a stable marker into an app-managed note and is idempotent", async () => {
    const tv = tempVault();
    await tv.writer.writeNote("Notes/Limits.md", {
      frontmatter: {},
      body: "Intro.\n\nThe definition is epsilon-delta.\n",
    });

    const res = await citeNoteParagraph(deps(tv), "Notes/Limits.md", "The definition is epsilon-delta.");
    expect(res.status).toBe("cited");
    if (res.status !== "cited") return;

    const note = await tv.reader.readNote("Notes/Limits.md");
    expect(note.body).toContain(`The definition is epsilon-delta. ^${res.blockId}`);

    const again = await citeNoteParagraph(deps(tv), "Notes/Limits.md", "The definition is epsilon-delta.");
    expect(again.status).toBe("unchanged");
  });

  it("returns absent for a missing note", async () => {
    const tv = tempVault();
    expect(await citeNoteParagraph(deps(tv), "Notes/Nope.md", "x")).toEqual({ status: "absent" });
  });

  it("never clobbers an unmanaged note — conflict, then 'cite anyway' via overwrite", async () => {
    const tv = tempVault();
    const abs = join(tv.vaultPath, "Notes/External.md");
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "Hand-written.\n\nThe key idea is compactness.\n"); // unmanaged (not via writer)

    const conflict = await citeNoteParagraph(deps(tv), "Notes/External.md", "The key idea is compactness.");
    expect(conflict.status).toBe("conflict");
    if (conflict.status === "conflict") expect(conflict.reason).toBe("unmanaged");

    const forced = await citeNoteParagraph(deps(tv), "Notes/External.md", "The key idea is compactness.", {
      overwrite: true,
    });
    expect(forced.status).toBe("cited");
    const note = await tv.reader.readNote("Notes/External.md");
    expect(note.body).toContain("The key idea is compactness. ^cic-");
  });
});
