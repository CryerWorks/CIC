// @vitest-environment node
import { describe, it, expect } from "vitest";
import { writeGapsToVault } from "./gapWriter";
import { NodeVaultFs } from "../../vault/adapters/node";
import { VaultWriter } from "../../vault/writer";
import { InMemoryWriteLog } from "../../vault/test-support";
import type { FeynmanGap } from "../../ai/features/feynman/types";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Create a temp vault path and wire a real VaultWriter with the node fs adapter. */
function makeWriter(vaultPath: string): VaultWriter {
  const fs = new NodeVaultFs();
  const log = new InMemoryWriteLog();
  return new VaultWriter(fs, vaultPath, log);
}

/** Make a temp vault directory and return the path + writer. */
function setup() {
  const vaultPath = mkdtempSync(join(tmpdir(), "cic-gapwriter-"));
  const writer = makeWriter(vaultPath);
  return { vaultPath, writer, cleanup: () => rmSync(vaultPath, { recursive: true, force: true }) };
}

const sampleGaps: FeynmanGap[] = [
  { text: "Does not understand the epsilon-delta definition of a limit" },
  { text: "Cannot apply the chain rule to composite functions with multiple variables" },
];

interface GapSaveTarget {
  type: "session-writeup" | "standalone-note";
  notePath: string;
  courseId?: string;
}

describe("writeGapsToVault", () => {
  it("writes gaps to a standalone note with cic-type frontmatter", async () => {
    const { vaultPath, writer, cleanup } = setup();
    try {
      const target: GapSaveTarget = {
        type: "standalone-note",
        notePath: "Feynman Gaps/calculus-gaps.md",
        courseId: "course-1",
      };

      await writeGapsToVault(sampleGaps, target, writer);

      // Read back the file and verify
      const abs = join(vaultPath, target.notePath);
      const content = readFileSync(abs, "utf-8");

      expect(content).toContain("cic-type: feynman-gaps");
      expect(content).toContain("course_id: course-1");
      expect(content).toContain("## Gaps from Feynman");
      expect(content).toContain("- [ ] Does not understand the epsilon-delta definition of a limit");
      expect(content).toContain("- [ ] Cannot apply the chain rule");
    } finally {
      cleanup();
    }
  });

  it("writes gaps to a standalone note without course_id when not provided", async () => {
    const { vaultPath, writer, cleanup } = setup();
    try {
      const target: GapSaveTarget = {
        type: "standalone-note",
        notePath: "Feynman Gaps/no-course-gaps.md",
      };

      await writeGapsToVault(sampleGaps, target, writer);

      const abs = join(vaultPath, target.notePath);
      const content = readFileSync(abs, "utf-8");

      expect(content).toContain("cic-type: feynman-gaps");
      expect(content).not.toContain("course_id");
      expect(content).toContain("## Gaps from Feynman");
    } finally {
      cleanup();
    }
  });

  it("writes gaps to a session-writeup note", async () => {
    const { vaultPath, writer, cleanup } = setup();
    try {
      const target: GapSaveTarget = {
        type: "session-writeup",
        notePath: "Sessions/my-session.md",
      };

      await writeGapsToVault(sampleGaps, target, writer);

      const abs = join(vaultPath, target.notePath);
      const content = readFileSync(abs, "utf-8");

      expect(content).toContain("## Gaps from Feynman");
      expect(content).toContain("- [ ] Does not understand the epsilon-delta definition of a limit");
      expect(content).toContain("- [ ] Cannot apply the chain rule");
    } finally {
      cleanup();
    }
  });

  it("writes gaps with sourceName when available", async () => {
    const { vaultPath, writer, cleanup } = setup();
    try {
      const gapsWithSource: FeynmanGap[] = [
        { text: "Gap from calculus", sourceName: "Calculus Textbook" },
      ];
      const target: GapSaveTarget = {
        type: "standalone-note",
        notePath: "gaps-with-source.md",
      };

      await writeGapsToVault(gapsWithSource, target, writer);

      const abs = join(vaultPath, target.notePath);
      const content = readFileSync(abs, "utf-8");

      expect(content).toContain("- [ ] Gap from calculus");
    } finally {
      cleanup();
    }
  });

  it("is a no-op with empty gaps array", async () => {
    const { vaultPath, writer, cleanup } = setup();
    try {
      const target: GapSaveTarget = {
        type: "standalone-note",
        notePath: "empty.md",
      };

      // Should not throw or attempt to write
      await writeGapsToVault([], target, writer);

      // File should not exist
      expect(existsSync(join(vaultPath, target.notePath))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("writes session-writeup with no frontmatter (empty object)", async () => {
    const { vaultPath, writer, cleanup } = setup();
    try {
      const target: GapSaveTarget = {
        type: "session-writeup",
        notePath: "simple-session.md",
      };

      await writeGapsToVault(sampleGaps, target, writer);

      const abs = join(vaultPath, target.notePath);
      const content = readFileSync(abs, "utf-8");

      // No frontmatter fence since frontmatter is empty
      expect(content).toContain("## Gaps from Feynman");
      expect(content).toContain("- [ ] Does not understand");
      // Should NOT have --- fences since frontmatter was empty
      expect(content).not.toContain("cic-type");
    } finally {
      cleanup();
    }
  });
});
