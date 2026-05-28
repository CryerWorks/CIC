import { describe, it, expect } from "vitest";
import { mocRelPathFor } from "./filename";

describe("mocRelPathFor (R8)", () => {
  it("produces a human-readable Courses/<Title>.md path", () => {
    expect(mocRelPathFor("Real Analysis", [])).toBe("Courses/Real Analysis.md");
  });

  it("strips filesystem-illegal characters but keeps it readable", () => {
    expect(mocRelPathFor("Algebra: Rings & Fields", [])).toBe("Courses/Algebra Rings & Fields.md");
  });

  it("collapses whitespace and trims", () => {
    expect(mocRelPathFor("  Spaced   Out  ", [])).toBe("Courses/Spaced Out.md");
  });

  it("suffixes on collision and never returns a taken path", () => {
    const taken = ["Courses/Topology.md", "Courses/Topology (2).md"];
    const p = mocRelPathFor("Topology", taken);
    expect(p).toBe("Courses/Topology (3).md");
    expect(taken).not.toContain(p);
  });

  it("falls back to a default for an empty/all-illegal title", () => {
    expect(mocRelPathFor("///", [])).toBe("Courses/Untitled Course.md");
  });
});
