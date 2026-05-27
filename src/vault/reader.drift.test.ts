// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
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

const S = z.object({ title: z.string() });

describe("read drift is informational, non-blocking (US2 · FR-010)", () => {
  it("a read after an external edit returns current content with drift=true", async () => {
    const { writer, reader, vaultPath } = vault();
    await writer.writeNote("n.md", { frontmatter: { title: "A" }, body: "original\n" });
    writeFileSync(join(vaultPath, "n.md"), "---\ntitle: A\n---\nEDITED\n");

    const out = await reader.readNoteAs("n.md", S);
    expect(out.ok).toBe(true);
    expect(out.drift).toBe(true); // surfaced…
    if (out.ok) expect(out.note.body).toBe("EDITED\n"); // …but the read is NOT blocked
  });

  it("no drift for an unchanged managed note", async () => {
    const { writer, reader } = vault();
    await writer.writeNote("n.md", { frontmatter: { title: "A" }, body: "original\n" });
    const out = await reader.readNoteAs("n.md", S);
    expect(out.drift).toBe(false);
  });
});
