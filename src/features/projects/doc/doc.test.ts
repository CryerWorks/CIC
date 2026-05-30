// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  buildFrontmatter,
  renderProjectDoc,
  renderTemplateBody,
  PROJECT_TEMPLATES,
  swapFrontmatter,
  appendReflection,
  parseProjectFile,
  ProjectParseError,
  type ProjectDocModel,
} from "./index";

const model: ProjectDocModel = {
  id: "proj-1",
  courseId: "course-1",
  title: "Diagonalize a 3×3 by hand",
  courseTitle: "Linear Algebra",
  capability: "I can diagonalize a real symmetric matrix unaided.",
  status: "open",
  milestoneIds: ["m-1", "m-2"],
  openedDate: "2026-05-29",
  closedDate: null,
  template: "math/proof",
};

describe("Project document module (Feature 015)", () => {
  it("parse∘render round-trips frontmatter (incl. course-id — M2) and the template body", () => {
    const doc = renderProjectDoc(model);
    const parsed = parseProjectFile({ data: doc.frontmatter, body: doc.body });
    expect(parsed).not.toBeInstanceOf(ProjectParseError);
    if (parsed instanceof ProjectParseError) return;
    expect(parsed.frontmatter["cic-type"]).toBe("project");
    expect(parsed.frontmatter["cic-id"]).toBe("proj-1");
    expect(parsed.frontmatter["course-id"]).toBe("course-1");
    expect(parsed.frontmatter.title).toBe(model.title);
    expect(parsed.frontmatter.capability).toBe(model.capability);
    expect(parsed.frontmatter.milestones).toEqual(["m-1", "m-2"]);
    expect(parsed.body).toBe(renderTemplateBody("math/proof"));
  });

  it("buildFrontmatter emits course-id from courseId and omits null closed/template", () => {
    const fm = buildFrontmatter({ ...model, template: null });
    expect(fm["course-id"]).toBe("course-1");
    expect("closed" in fm).toBe(false);
    expect("template" in fm).toBe(false);
  });

  it("renderTemplateBody is total over every name + null and weaves framing into Problem (M1)", () => {
    for (const name of [...PROJECT_TEMPLATES, null]) {
      const body = renderTemplateBody(name);
      expect(body.length).toBeGreaterThan(0);
      expect(body).toContain("## Problem");
    }
    const framed = renderTemplateBody("freeform", "Solve problems 1–10 from Strang Ch.6.");
    expect(framed).toContain("## Problem\nSolve problems 1–10 from Strang Ch.6.");
    // blank framing leaves the placeholder (no injection)
    const blank = renderTemplateBody("freeform", "   ");
    expect(blank).toBe(renderTemplateBody("freeform"));
  });

  it("swapFrontmatter never mutates the body", () => {
    const userBody = "## Problem\nmy own writing\n\n## Work\ncode here\n";
    const out = swapFrontmatter(userBody, { ...model, status: "in-progress" });
    expect(out.body).toBe(userBody);
    expect(out.frontmatter.status).toBe("in-progress");
  });

  it("appendReflection appends additively; blank is a no-op", () => {
    const body = "## Work\nsome work\n";
    const appended = appendReflection(body, "kept dropping the sign on the eigenvector", "2026-06-02");
    expect(appended).toContain("some work");
    expect(appended).toContain("## Reflection (closed 2026-06-02)");
    expect(appended).toContain("kept dropping the sign on the eigenvector");
    expect(appendReflection(body, "   ", "2026-06-02")).toBe(body);
  });

  it("returns ProjectParseError (no throw) on malformed frontmatter", () => {
    const bad = parseProjectFile({ data: { "cic-type": "course", title: "" }, body: "x" });
    expect(bad).toBeInstanceOf(ProjectParseError);
  });
});
