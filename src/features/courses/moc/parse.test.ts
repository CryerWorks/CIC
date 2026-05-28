import { describe, it, expect } from "vitest";
import { renderMocBody } from "./render";
import { parseMocBody } from "./parse";
import { MocParseError, type MocModel } from "./model";

const model: MocModel = {
  id: "c1",
  title: "RA",
  domain: "Math",
  campaign: null,
  capability: "Cap paragraph.",
  milestones: [
    { id: "m1", capability: "Define a limit", status: "todo" },
    { id: "m2", capability: "Prove continuity", status: "done" },
  ],
};

describe("parseMocBody (R7)", () => {
  it("round-trips capability + milestones from rendered output", () => {
    const result = parseMocBody(renderMocBody(model));
    if (result instanceof MocParseError) throw result;
    expect(result.capability).toBe("Cap paragraph.");
    expect(result.milestones).toEqual([
      { id: "m1", capability: "Define a limit", status: "todo" },
      { id: "m2", capability: "Prove continuity", status: "done" },
    ]);
  });

  it("treats empty/absent sections as empty, not errors", () => {
    const result = parseMocBody(renderMocBody({ ...model, capability: "", milestones: [] }));
    if (result instanceof MocParseError) throw result;
    expect(result.capability).toBe("");
    expect(result.milestones).toEqual([]);
  });

  it("surfaces a user-added (comment-less) milestone with id null", () => {
    const body = renderMocBody(model).replace(
      "<!-- /cic:milestones -->",
      "- [ ] Hand-added goal\n<!-- /cic:milestones -->",
    );
    const result = parseMocBody(body);
    if (result instanceof MocParseError) throw result;
    expect(result.milestones[result.milestones.length - 1]).toEqual({
      id: null,
      capability: "Hand-added goal",
      status: "todo",
    });
  });

  it("returns MocParseError on an unterminated marker", () => {
    const broken = "## Milestones\n<!-- cic:milestones -->\n- [ ] x\n(no close)";
    expect(parseMocBody(broken)).toBeInstanceOf(MocParseError);
  });
});
