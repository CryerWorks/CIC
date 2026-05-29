import { describe, it, expect } from "vitest";
import { resourceTarget, openCitation, isPdfFileUrl } from "./openTarget";
import type { Resource } from "../../../db";
import type { ResourceKind } from "../../../db";

function res(kind: ResourceKind, over: Partial<Resource> = {}): Resource {
  return {
    id: "r",
    vault_id: "v",
    domain_id: null,
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

  it("other internalized file-kinds (epub/markdown/video_file/audio) open via file:// once a file is stored", () => {
    expect(resourceTarget(res("epub", { file_path: "/lib/book.epub" }), null)).toBe("file:///lib/book.epub");
    expect(resourceTarget(res("video_file", { file_path: "/v/clip.mp4" }), null)).toBe("file:///v/clip.mp4");
    // still null until a file is internalized (the previously-grayed "Open"):
    expect(resourceTarget(res("audio"), "0:30")).toBeNull();
  });
});

describe("isPdfFileUrl (PDFs route to the browser so #page= is honored)", () => {
  it("matches a file:// PDF, ignoring the #page / ? suffix and case", () => {
    expect(isPdfFileUrl("file:///docs/rudin.pdf#page=10")).toBe(true);
    expect(isPdfFileUrl("file:///C:/docs/Baby%20Rudin.PDF")).toBe(true);
    expect(isPdfFileUrl("file:///docs/rudin.pdf?x=1")).toBe(true);
  });

  it("excludes non-PDF files and remote URLs (those keep the plain opener)", () => {
    expect(isPdfFileUrl("file:///lib/book.epub")).toBe(false);
    expect(isPdfFileUrl("file:///v/clip.mp4")).toBe(false);
    expect(isPdfFileUrl("https://x.com/a.pdf#page=2")).toBe(false);
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
