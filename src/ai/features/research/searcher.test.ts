// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ManualAdapter, createSearchProvider } from "./searcher";

describe("ManualAdapter", () => {
  it("returns empty list when no URLs added", async () => {
    const adapter = new ManualAdapter();
    const results = await adapter.search("anything");
    expect(results).toEqual([]);
  });

  it("returns manually added URLs", async () => {
    const adapter = new ManualAdapter();
    adapter.addUrl("https://example.com/course", "Example Course", "A test course", "courseware");
    adapter.addUrl("https://example.org/article", "Example Article", "A test article", "article");

    const results = await adapter.search("test");
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Example Course");
    expect(results[0].sourceType).toBe("courseware");
    expect(results[1].url).toBe("https://example.org/article");
  });

  it("clears URLs when clear() is called", async () => {
    const adapter = new ManualAdapter();
    adapter.addUrl("https://example.com", "Test");
    adapter.clear();
    const results = await adapter.search("test");
    expect(results).toEqual([]);
  });

  it("setUrls replaces all URLs", async () => {
    const adapter = new ManualAdapter();
    adapter.addUrl("https://example.com/old", "Old");
    adapter.setUrls([
      { url: "https://example.com/new", title: "New", snippet: "", sourceType: "other" },
    ]);
    const results = await adapter.search("test");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("New");
  });
});

describe("createSearchProvider", () => {
  it("returns ManualAdapter when searchUrl is empty", () => {
    const provider = createSearchProvider("");
    expect(provider).toBeInstanceOf(ManualAdapter);
  });

  it("returns ManualAdapter when searchUrl is undefined", () => {
    const provider = createSearchProvider();
    expect(provider).toBeInstanceOf(ManualAdapter);
  });

  it("returns SearXNGAdapter when searchUrl is provided", () => {
    const provider = createSearchProvider("http://localhost:8888");
    expect(provider.constructor.name).toBe("SearXNGAdapter");
  });
});
