import { describe, it, expect } from "vitest";
import { buildWriteup, writeupPath, type WriteupData } from "./writeup";

const base: WriteupData = {
  date: "2026-05-29T09:30:00.000Z",
  courseTitle: "Real Analysis",
  objective: "State the epsilon-delta definition of a limit",
  pretest: [],
  assignments: [],
  retrievalText: "",
  selfTestText: "",
  cardsMade: [],
  notePath: null,
};

describe("buildWriteup (PRD F7, type: log)", () => {
  it("emits type/date/course/objective frontmatter (date-only)", () => {
    const note = buildWriteup(base);
    expect(note.frontmatter).toEqual({
      type: "log",
      date: "2026-05-29",
      course: "Real Analysis",
      objective: "State the epsilon-delta definition of a limit",
    });
    expect(note.body).toContain("# Session — 2026-05-29");
    expect(note.body).toContain("**Objective:** State the epsilon-delta definition of a limit");
  });

  it("omits empty sections (a skipped pretest leaves no heading)", () => {
    const note = buildWriteup(base);
    expect(note.body).not.toContain("## Pretest");
    expect(note.body).not.toContain("## Studied");
    expect(note.body).not.toContain("## Cards made");
  });

  it("renders each section when present, with the pretest unscored and a note wikilink", () => {
    const note = buildWriteup({
      ...base,
      pretest: [{ question: "What is a limit?", userResponse: "a guess" }, { question: "Why?", userResponse: null }],
      assignments: [{ label: "Baby Rudin (read)", locator: "page=10" }],
      retrievalText: "epsilon-delta from memory",
      selfTestText: "explained it aloud",
      cardsMade: [{ front: "Define a limit", back: "epsilon-delta" }],
      notePath: "Notes/Limits.md",
    });
    expect(note.body).toContain("## Pretest — what I thought");
    expect(note.body).toContain("- **Q:** What is a limit?\n  - a guess");
    expect(note.body).toContain("  - (no answer)"); // null response, never scored
    expect(note.body).toContain("## Studied\n- Baby Rudin (read) — page=10");
    expect(note.body).toContain("## Recalled from memory\nepsilon-delta from memory");
    expect(note.body).toContain("## Self-test / gaps\nexplained it aloud");
    expect(note.body).toContain("## Cards made\n- Define a limit → epsilon-delta");
    expect(note.body).toContain("## Note\n[[Limits]]");
  });

  it("is idempotent (same data → identical output)", () => {
    expect(buildWriteup(base)).toEqual(buildWriteup(base));
  });
});

describe("writeupPath", () => {
  it("builds a collision-free Sessions/ path with a slug + short id", () => {
    const p = writeupPath("2026-05-29T09:30:00.000Z", "State the epsilon-delta definition", "abcd1234- effff");
    expect(p.startsWith("Sessions/2026-05-29 ")).toBe(true);
    expect(p).toContain("state-the-epsilon-delta-definition");
    expect(p).toContain("(abcd1234)");
    expect(p.endsWith(".md")).toBe(true);
  });

  it("falls back to 'session' when the objective has no slug-able characters", () => {
    expect(writeupPath("2026-05-29T00:00:00.000Z", "!!!", "zzzzzzzz-1")).toBe("Sessions/2026-05-29 session (zzzzzzzz).md");
  });
});
