import { describe, it, expect } from "vitest";
import { renderMocBody } from "./render";
import { mergeMocBody } from "./merge";
import type { MocModel } from "./model";

const model: MocModel = {
  id: "c1",
  title: "Real Analysis",
  domain: "Mathematics",
  campaign: null,
  capability: "Cap text.",
  milestones: [{ id: "m1", capability: "Define a limit", status: "todo" }],
};

describe("mergeMocBody (R4)", () => {
  it("is idempotent on app-rendered output", () => {
    const rendered = renderMocBody(model);
    expect(mergeMocBody(rendered, model)).toBe(rendered);
  });

  it("preserves the user-owned Reflections section + trailing prose across repeated merges", () => {
    let body = renderMocBody(model).replace(
      "<!-- user-owned — the app never writes here -->",
      "<!-- user-owned — the app never writes here -->\nMy private reflection.",
    );
    body += "\nTrailing user note.\n";

    const updated: MocModel = {
      ...model,
      milestones: [{ id: "m1", capability: "Define a limit precisely", status: "in-progress" }],
    };
    let out = body;
    for (let i = 0; i < 3; i += 1) out = mergeMocBody(out, updated);

    expect(out).toContain("My private reflection.");
    expect(out).toContain("Trailing user note.");
    expect(out).toContain("- [/] Define a limit precisely <!-- cic:m id=m1 status=in-progress -->");
  });

  it("preserves user prose written between marker blocks", () => {
    const withProse = renderMocBody(model).replace(
      "<!-- /cic:milestones -->",
      "<!-- /cic:milestones -->\n\nA note I wrote between sections.",
    );
    const out = mergeMocBody(withProse, { ...model, capability: "New cap." });
    expect(out).toContain("A note I wrote between sections.");
    expect(out).toContain("<!-- cic:capability -->\nNew cap.\n<!-- /cic:capability -->");
  });

  it("re-inserts a section the user deleted", () => {
    const withoutMilestones = renderMocBody(model).replace(
      /## Milestones\n<!-- cic:milestones -->[\s\S]*?<!-- \/cic:milestones -->\n\n/,
      "",
    );
    expect(withoutMilestones).not.toContain("<!-- cic:milestones -->");

    const out = mergeMocBody(withoutMilestones, model);
    expect(out).toContain("<!-- cic:milestones -->");
    expect(out).toContain("- [ ] Define a limit <!-- cic:m id=m1 status=todo -->");
  });

  it("never duplicates a marker pair", () => {
    const out = mergeMocBody(renderMocBody(model), model);
    expect(out.match(/<!-- cic:milestones -->/g)?.length).toBe(1);
    expect(out.match(/<!-- cic:capability -->/g)?.length).toBe(1);
  });

  it("leaves a malformed (unterminated) marker untouched rather than clobbering it", () => {
    const broken =
      "## Capability\n<!-- cic:capability -->\nNo close here.\n\n## Reflections\n<!-- user-owned -->\n";
    const out = mergeMocBody(broken, model);
    expect(out).toContain("No close here.");
    expect(out.match(/<!-- cic:capability -->/g)?.length).toBe(1);
  });
});
