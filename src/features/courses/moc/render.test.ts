import { describe, it, expect } from "vitest";
import { buildFrontmatter, renderMocBody } from "./render";
import { MocCourseFrontmatterSchema } from "./frontmatter";
import type { MocModel } from "./model";

const base: MocModel = {
  id: "c1",
  title: "Real Analysis",
  domain: "Mathematics",
  campaign: null,
  capability: "Work rigorously with limits and continuity.",
  milestones: [
    { id: "m1", capability: "Define a limit", status: "todo" },
    { id: "m2", capability: "Prove continuity", status: "done" },
  ],
};

describe("buildFrontmatter", () => {
  it("produces frontmatter that parses through the schema", () => {
    const fm = buildFrontmatter(base);
    expect(fm["cic-type"]).toBe("course");
    expect(fm["cic-id"]).toBe("c1");
    expect(MocCourseFrontmatterSchema.safeParse(fm).success).toBe(true);
  });

  it("carries the campaign title through", () => {
    expect(buildFrontmatter({ ...base, campaign: "Analysis Track" }).campaign).toBe("Analysis Track");
  });
});

describe("renderMocBody", () => {
  it("includes all canonical sections in order, then Reflections", () => {
    const body = renderMocBody(base);
    const order = [
      "## Capability",
      "## Milestones",
      "## Resources",
      "## Active Projects",
      "## Recent Sessions",
      "## Notes",
      "## Reflections",
    ];
    let last = -1;
    for (const heading of order) {
      const idx = body.indexOf(heading);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });

  it("wraps capability + milestones in their markers", () => {
    const body = renderMocBody(base);
    expect(body).toContain(
      "<!-- cic:capability -->\nWork rigorously with limits and continuity.\n<!-- /cic:capability -->",
    );
    expect(body).toContain("- [ ] Define a limit <!-- cic:m id=m1 status=todo -->");
    expect(body).toContain("- [x] Prove continuity <!-- cic:m id=m2 status=done -->");
  });

  it("renders the skeleton sections as empty marker pairs", () => {
    const body = renderMocBody(base);
    expect(body).toContain("<!-- cic:resources -->\n<!-- /cic:resources -->");
    expect(body).toContain("<!-- cic:projects -->\n<!-- /cic:projects -->");
    expect(body).toContain("<!-- cic:sessions -->\n<!-- /cic:sessions -->");
    expect(body).toContain("<!-- cic:notes -->\n<!-- /cic:notes -->");
  });

  it("handles zero milestones and empty capability", () => {
    const body = renderMocBody({ ...base, capability: "", milestones: [] });
    expect(body).toContain("<!-- cic:capability -->\n<!-- /cic:capability -->");
    expect(body).toContain("<!-- cic:milestones -->\n<!-- /cic:milestones -->");
  });
});
