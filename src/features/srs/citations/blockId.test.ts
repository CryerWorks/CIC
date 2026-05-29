import { describe, it, expect } from "vitest";
import { blockIdFor, ensureBlockMarker } from "./blockId";

describe("blockId", () => {
  it("blockIdFor is deterministic for the same paragraph", () => {
    expect(blockIdFor("A limit is a value a function approaches.")).toBe(
      blockIdFor("A limit is a value a function approaches."),
    );
    expect(blockIdFor("one")).not.toBe(blockIdFor("two"));
  });

  it("ensureBlockMarker appends a marker to the target line only", () => {
    const body = "First paragraph.\n\nThe definition is epsilon-delta.\n\nLast paragraph.";
    const { body: next, blockId, changed } = ensureBlockMarker(body, "The definition is epsilon-delta.");
    expect(changed).toBe(true);
    expect(next).toContain(`The definition is epsilon-delta. ^${blockId}`);
    expect(next).toContain("First paragraph.\n"); // untouched
    expect(next).toContain("Last paragraph."); // untouched
  });

  it("is idempotent — a second pass changes nothing", () => {
    const body = "The definition is epsilon-delta.";
    const first = ensureBlockMarker(body, "The definition is epsilon-delta.");
    const second = ensureBlockMarker(first.body, "The definition is epsilon-delta.");
    expect(second.changed).toBe(false);
    expect(second.body).toBe(first.body);
    expect(second.blockId).toBe(first.blockId);
  });

  it("leaves the body unchanged when the paragraph is absent", () => {
    const { changed, body } = ensureBlockMarker("Some note.", "Not present.");
    expect(changed).toBe(false);
    expect(body).toBe("Some note.");
  });
});
