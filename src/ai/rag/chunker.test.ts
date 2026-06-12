// @vitest-environment node
import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "./chunker/markdown";
import { chunkEpub, type ParsedEpub } from "./chunker/epub";

const VAULT_ID = "v-test-01";
const SOURCE_ID = "src-01";
const TITLE = "Test Document";

describe("Markdown chunker", () => {
  it("splits content at H2 headings", () => {
    const md = `## Section A
Content for section A.

## Section B
Content for section B.`;

    const { chunks, title } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);

    expect(title).toBe(TITLE);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].headingPath).toBe("Section A");
    expect(chunks[0].textContent).toContain("Section A:");
    expect(chunks[0].textContent).toContain("Content for section A");
    expect(chunks[1].headingPath).toBe("Section B");
    expect(chunks[1].textContent).toContain("Section B:");
    expect(chunks[1].textContent).toContain("Content for section B");
  });

  it("splits at H1, H2, H3 headings", () => {
    const md = `# Title
Content under title.

### Sub Section
Content under sub section.`;

    const { chunks } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].headingPath).toBe("Title");
    expect(chunks[1].headingPath).toBe("Sub Section");
  });

  it("flattens H4+ headings into parent section", () => {
    const md = `## Section
Content here.

#### Deeper
Flattened content.

## Section 2
More content.`;

    const { chunks } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].headingPath).toBe("Section");
    expect(chunks[0].textContent).toContain("#### Deeper");
    expect(chunks[1].headingPath).toBe("Section 2");
  });

  it("extracts title from frontmatter and excludes frontmatter from chunks", () => {
    const md = `---
title: "Real Analysis"
author: John Doe
---

## Limits
Definition of a limit.`;

    const { chunks, title } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(title).toBe("Real Analysis");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].textContent).not.toContain("---");
    expect(chunks[0].textContent).not.toContain("author:");
    expect(chunks[0].textContent).toContain("Limits:");
  });

  it("falls back to provided title when frontmatter has no title field", () => {
    const md = `---
author: John Doe
---

## Content
Stuff.`;

    const { title } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(title).toBe(TITLE);
  });

  it("preserves [[wikilinks]] in chunk text", () => {
    const md = `## References
See [[chain rule]] and [[implicit differentiation]] for more.`;

    const { chunks } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(chunks[0].textContent).toContain("[[chain rule]]");
    expect(chunks[0].textContent).toContain("[[implicit differentiation]]");
  });

  it("preserves [markdown links](url)", () => {
    const md = `## Links
See [Wikipedia](https://en.wikipedia.org/wiki/Calculus).`;

    const { chunks } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(chunks[0].textContent).toContain("[Wikipedia](https://en.wikipedia.org/wiki/Calculus)");
  });

  it("returns empty chunks for empty content", () => {
    const { chunks } = chunkMarkdown("", "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(chunks).toHaveLength(0);
  });

  it("returns empty chunks for frontmatter-only content", () => {
    const md = `---
title: "Empty"
---`;

    const { chunks, title } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(title).toBe("Empty");
    expect(chunks).toHaveLength(0);
  });

  it("creates single chunk for content without headings", () => {
    const md = "Plain text without any headings at all.";
    const { chunks } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].headingPath).toBeNull();
  });

  it("content before first heading becomes a leading chunk", () => {
    const md = `Preamble content.

## First Section
Body.`;

    const { chunks } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const leadChunk = chunks.find((c) => c.textContent.includes("Preamble"));
    expect(leadChunk).toBeTruthy();
  });

  it("splits oversized sections at paragraph boundaries", () => {
    const tinyLimit = 50;
    const md = `## Section
Short paragraph here.

Another paragraph here.

Yet more text in a third paragraph.`;

    const { chunks } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID, tinyLimit);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.headingPath).toContain("Section");
    }
  });

  it("assigns sequential chunk_index values", () => {
    const md = `## A
Content A.

## B
Content B.

## C
Content C.`;

    const { chunks } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks[2].chunkIndex).toBe(2);
  });

  it("sets source title and vault ID on every chunk", () => {
    const md = "## Foo\nBar.";
    const { chunks } = chunkMarkdown(md, "resource", SOURCE_ID, TITLE, VAULT_ID);
    expect(chunks[0].sourceTitle).toBe(TITLE);
    expect(chunks[0].vaultId).toBe(VAULT_ID);
    expect(chunks[0].sourceId).toBe(SOURCE_ID);
    expect(chunks[0].sourceKind).toBe("resource");
  });

  it("sets correct metadata for note-kind chunks", () => {
    const notePath = "math/lecture.md";
    const md = "## Summary\nKey points.";
    const { chunks } = chunkMarkdown(md, "note", notePath, "Lecture Notes", VAULT_ID);
    expect(chunks[0].sourceKind).toBe("note");
    expect(chunks[0].sourceId).toBe(notePath);
  });
});

describe("EPUB chunker", () => {
  type MockChapter = { title: string; headingPath: string; text: string; id?: string; index?: number };
  const mockParsedEpub = (overrides: Partial<{ chapters: MockChapter[]; title: string }> = {}): ParsedEpub => {
    const chapters = (overrides.chapters ?? [
      {
        title: "Chapter 1",
        headingPath: "Chapter 1",
        text: "This is the content of chapter one. It has multiple paragraphs.\n\nSecond paragraph here.",
        id: "ch1",
        index: 0,
      },
      {
        title: "Chapter 2",
        headingPath: "Part I > Chapter 2",
        text: "Content of chapter two.",
        id: "ch2",
        index: 1,
      },
    ]).map((c, i) => ({
      title: c.title,
      headingPath: c.headingPath,
      text: c.text,
      id: c.id ?? `ch${i}`,
      index: c.index ?? i,
    }));

    return {
      title: overrides.title ?? "Test EPUB",
      chapters,
    };
  };

  it("creates one chunk per chapter", () => {
    const parsed = mockParsedEpub();
    const { title, chunks } = chunkEpub(parsed, SOURCE_ID, VAULT_ID);

    expect(title).toBe("Test EPUB");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].headingPath).toBe("Chapter 1");
    expect(chunks[0].textContent).toContain("Second paragraph here");
    expect(chunks[1].headingPath).toBe("Part I > Chapter 2");
  });

  it("splits oversized chapters by paragraphs", () => {
    const longText = "A".repeat(1500) + "\n\n" + "B".repeat(1500) + "\n\n" + "C".repeat(1500);
    const parsed = mockParsedEpub({
      chapters: [{ title: "Long", headingPath: "Long", text: longText, id: "ch1", index: 0 }],
    });
    const { chunks } = chunkEpub(parsed, SOURCE_ID, VAULT_ID, 1000);

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0].textContent).toContain("AAAA");
  });

  it("skips empty chapters", () => {
    const parsed = mockParsedEpub({
      chapters: [
        { title: "Chap1", headingPath: "Chap1", text: "Content.", id: "ch1", index: 0 },
        { title: "Empty", headingPath: "Empty", text: "", id: "ch2", index: 1 },
        { title: "Chap3", headingPath: "Chap3", text: "More.", id: "ch3", index: 2 },
      ],
    });
    const { chunks } = chunkEpub(parsed, SOURCE_ID, VAULT_ID);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].headingPath).toBe("Chap1");
    expect(chunks[1].headingPath).toBe("Chap3");
  });

  it("sets source metadata correctly", () => {
    const parsed = mockParsedEpub();
    const { chunks } = chunkEpub(parsed, "res-epub-1", VAULT_ID);

    expect(chunks[0].sourceKind).toBe("resource");
    expect(chunks[0].sourceId).toBe("res-epub-1");
    expect(chunks[0].sourceTitle).toBe("Test EPUB");
    expect(chunks[0].vaultId).toBe(VAULT_ID);
  });

  it("assigns sequential chunk indices across chapters", () => {
    const parsed = mockParsedEpub();
    const { chunks } = chunkEpub(parsed, SOURCE_ID, VAULT_ID);

    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
  });

  it("tracks char offsets", () => {
    const parsed = mockParsedEpub({
      chapters: [{ title: "A", headingPath: "A", text: "12345", id: "ch1", index: 0 }],
    });
    const { chunks } = chunkEpub(parsed, SOURCE_ID, VAULT_ID);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].charOffsetStart).toBe(0);
    expect(chunks[0].charOffsetEnd).toBe(5);
  });
});
