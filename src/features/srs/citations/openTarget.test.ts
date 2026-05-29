import { describe, it, expect } from "vitest";
import { resourceTarget, openCitation } from "./openTarget";
import type { Resource } from "../../../db";
import type { ResourceKind } from "../../../db";

function res(kind: ResourceKind, over: Partial<Resource> = {}): Resource {
  return {
    id: "r",
    vault_id: "v",
    title: "t",
    kind,
    file_path: null,
    url: null,
    metadata: {},
    ingested_at: null,
    added_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("resourceTarget (F3.7 / R8)", () => {
  it("a PDF opens at #page=N", () => {
    expect(resourceTarget(res("pdf", { file_path: "/docs/rudin.pdf" }), "page=10")).toBe(
      "file:///docs/rudin.pdf#page=10",
    );
  });

  it("a web page opens at #anchor", () => {
    expect(resourceTarget(res("web_page", { url: "https://x.com/a" }), "intro")).toBe("https://x.com/a#intro");
  });

  it("a video URL opens at ?t=N (or &t= when a query exists)", () => {
    expect(resourceTarget(res("video_url", { url: "https://yt/watch?v=1" }), "90")).toBe(
      "https://yt/watch?v=1&t=90",
    );
    expect(resourceTarget(res("video_url", { url: "https://yt/x" }), "00:30")).toBe("https://yt/x?t=30");
  });

  it("a physical book has no auto-open target", () => {
    expect(resourceTarget(res("book"), "ch. 3")).toBeNull();
  });

  it("a file kind without a file_path has no target", () => {
    expect(resourceTarget(res("pdf"), "10")).toBeNull();
  });
});

describe("openCitation", () => {
  it("opens a target via the injected opener", async () => {
    let opened = "";
    expect(await openCitation("file:///x.pdf#page=2", async (t) => void (opened = t))).toEqual({ opened: true });
    expect(opened).toBe("file:///x.pdf#page=2");
  });

  it("degrades gracefully on a null target or a failing open (no throw)", async () => {
    expect(await openCitation(null)).toEqual({ opened: false });
    expect(await openCitation("x", () => Promise.reject(new Error("nope")))).toEqual({ opened: false });
  });
});
