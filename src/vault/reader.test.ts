// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
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

const NoteSchema = z.object({ title: z.string(), tags: z.array(z.string()).optional() });

describe("VaultReader round-trip (US1 · FR-001/002/003 · SC-001)", () => {
  it("writes frontmatter + body and reads them back faithfully", async () => {
    const { reader, writer } = vault();
    const body = "# Real Analysis\n\nThe **completeness** axiom.\n";

    const res = await writer.writeNote("Math/Real Analysis.md", {
      frontmatter: { title: "Real Analysis", tags: ["math"] },
      body,
    });
    expect(res.status).toBe("written");

    const out = await reader.readNoteAs("Math/Real Analysis.md", NoteSchema);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.note.frontmatter).toEqual({ title: "Real Analysis", tags: ["math"] });
      expect(out.note.body).toBe(body); // byte-faithful (body in canonical trailing-newline form)
      expect(out.note.raw).toContain("title: Real Analysis");
    }
  });

  it("stores clean Markdown — a fenced frontmatter block above the body", async () => {
    const { reader, writer } = vault();
    await writer.writeNote("Note.md", { frontmatter: { title: "X" }, body: "Body\n" });
    const raw = await reader.readNote("Note.md");
    expect(raw.raw.startsWith("---\n")).toBe(true);
    expect(raw.raw).toMatch(/title: X/);
    expect(raw.body).toBe("Body\n");
  });

  it("exists() reflects presence", async () => {
    const { reader, writer } = vault();
    expect(await reader.exists("ghost.md")).toBe(false);
    await writer.writeNote("ghost.md", { frontmatter: {}, body: "boo\n" });
    expect(await reader.exists("ghost.md")).toBe(true);
  });
});

describe("VaultReader.list (US1 · FR-013)", () => {
  it("lists .md files recursively, sorted, skipping non-md and .obsidian", async () => {
    const { writer, reader, vaultPath } = vault();
    await writer.writeNote("a.md", { frontmatter: {}, body: "a\n" });
    await writer.writeNote("Math/b.md", { frontmatter: {}, body: "b\n" });
    await writer.writeNote("Math/Sub/c.md", { frontmatter: {}, body: "c\n" });

    // A non-md file and an Obsidian config dir (with a stray .md) must be ignored.
    writeFileSync(join(vaultPath, "notes.txt"), "x");
    mkdirSync(join(vaultPath, ".obsidian"), { recursive: true });
    writeFileSync(join(vaultPath, ".obsidian", "workspace.md"), "should be skipped");

    expect(await reader.list()).toEqual(["Math/Sub/c.md", "Math/b.md", "a.md"].sort());
  });

  it("lists within a subfolder", async () => {
    const { writer, reader } = vault();
    await writer.writeNote("Math/b.md", { frontmatter: {}, body: "b\n" });
    await writer.writeNote("CS/d.md", { frontmatter: {}, body: "d\n" });
    expect(await reader.list("Math")).toEqual(["Math/b.md"]);
  });
});

describe("VaultReader edge cases (US1 · spec edge: empty body / empty frontmatter)", () => {
  it("a note with only frontmatter (empty body) round-trips and re-validates", async () => {
    const { reader, writer } = vault();
    await writer.writeNote("fm-only.md", { frontmatter: { title: "Only FM" }, body: "" });
    const out = await reader.readNoteAs("fm-only.md", NoteSchema);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.note.frontmatter.title).toBe("Only FM");
  });

  it("a note with only a body (empty frontmatter) is stored fence-less", async () => {
    const { reader, writer } = vault();
    await writer.writeNote("body-only.md", { frontmatter: {}, body: "Just prose.\n" });
    const raw = await reader.readNote("body-only.md");
    expect(raw.raw.startsWith("---")).toBe(false); // no empty frontmatter fence
    expect(raw.body).toBe("Just prose.\n");
  });

  it("re-writing a note is idempotent (body normalized once, then stable)", async () => {
    const { reader, writer } = vault();
    await writer.writeNote("idem.md", { frontmatter: { title: "T" }, body: "no trailing newline" });
    const first = await reader.readNote("idem.md");
    await writer.writeNote("idem.md", { frontmatter: { title: "T" }, body: first.body });
    const second = await reader.readNote("idem.md");
    expect(second.raw).toBe(first.raw);
  });
});
