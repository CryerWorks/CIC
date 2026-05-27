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

const NoteSchema = z.object({ title: z.string() });

describe("malformed frontmatter (US1 · FR-002 · SC-005)", () => {
  it("frontmatter that violates the schema → ok:false with zod issues, no throw", async () => {
    const { reader, writer } = vault();
    await writer.writeNote("bad.md", { frontmatter: { foo: "bar" }, body: "body\n" });

    const out = await reader.readNoteAs("bad.md", NoteSchema);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.name).toBe("FrontmatterParseError");
      expect(out.error.issues).toBeDefined();
    }
  });

  it("unparseable YAML frontmatter → ok:false, never a crash", async () => {
    const { reader, vaultPath } = vault();
    // Unclosed flow sequence — invalid YAML that js-yaml (under gray-matter) rejects.
    writeFileSync(join(vaultPath, "broken.md"), "---\nfoo: [1, 2\n---\nbody\n");

    const out = await reader.readNoteAs("broken.md", NoteSchema);
    expect(out.ok).toBe(false);
  });

  it("a missing note → ok:false, not a thrown error", async () => {
    const { reader } = vault();
    const out = await reader.readNoteAs("does-not-exist.md", NoteSchema);
    expect(out.ok).toBe(false);
  });
});
