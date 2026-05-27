// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { readdirSync } from "node:fs";
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

describe("atomic write (US1 · FR-004 · SC-002)", () => {
  it("leaves no .cic-tmp artifact and a complete note after success", async () => {
    const { writer, vaultPath } = vault();
    await writer.writeNote("Note.md", { frontmatter: { title: "X" }, body: "Complete body.\n" });

    const entries = readdirSync(vaultPath);
    expect(entries.some((e) => e.includes(".cic-tmp"))).toBe(false);
    expect(entries).toContain("Note.md");
  });

  it("overwriting an existing note replaces it wholesale (no partial content)", async () => {
    const { writer, reader } = vault();
    await writer.writeNote("Note.md", { frontmatter: {}, body: "v1\n" });
    await writer.writeNote(
      "Note.md",
      { frontmatter: {}, body: "v2 — longer replacement content.\n" },
      { overwrite: true },
    );

    const raw = await reader.readNote("Note.md");
    expect(raw.body).toBe("v2 — longer replacement content.\n");
  });

  it("creates intermediate folders within the vault", async () => {
    const { writer, reader } = vault();
    const res = await writer.writeNote("A/B/C/deep.md", { frontmatter: {}, body: "deep\n" });
    expect(res.status).toBe("written");
    expect(await reader.exists("A/B/C/deep.md")).toBe(true);
  });
});
