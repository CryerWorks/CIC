import { describe, it, expect } from "vitest";
import { renderMilestoneLine, parseMilestoneLine } from "./milestoneLine";
import type { MocMilestoneModel } from "./model";

const cases: MocMilestoneModel[] = [
  { id: "m1", capability: "Define a limit", status: "todo" },
  { id: "m2", capability: "Prove continuity", status: "in-progress" },
  { id: "m3", capability: "State the IVT", status: "done" },
];

describe("milestone line render/parse (R3)", () => {
  it("renders the right checkbox glyph + status token per status", () => {
    expect(renderMilestoneLine(cases[0])).toBe("- [ ] Define a limit <!-- cic:m id=m1 status=todo -->");
    expect(renderMilestoneLine(cases[1])).toBe("- [/] Prove continuity <!-- cic:m id=m2 status=in-progress -->");
    expect(renderMilestoneLine(cases[2])).toBe("- [x] State the IVT <!-- cic:m id=m3 status=done -->");
  });

  it("round-trips each status (render → parse)", () => {
    for (const m of cases) {
      expect(parseMilestoneLine(renderMilestoneLine(m))).toEqual(m);
    }
  });

  it("treats a comment-less task line as a user-added milestone (id: null)", () => {
    expect(parseMilestoneLine("- [ ] Sketch epsilon-delta proofs")).toEqual({
      id: null,
      capability: "Sketch epsilon-delta proofs",
      status: "todo",
    });
    expect(parseMilestoneLine("- [x] Done by hand")).toEqual({
      id: null,
      capability: "Done by hand",
      status: "done",
    });
  });

  it("returns null for a non-task line", () => {
    expect(parseMilestoneLine("Just a paragraph")).toBeNull();
    expect(parseMilestoneLine("")).toBeNull();
  });

  it("falls back to the checkbox glyph when the comment status is invalid", () => {
    expect(parseMilestoneLine("- [x] Cap <!-- cic:m id=z status=bogus -->")).toEqual({
      id: "z",
      capability: "Cap",
      status: "done",
    });
  });
});
