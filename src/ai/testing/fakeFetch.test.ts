import { describe, it, expect } from "vitest";
import { fakeFetch, streamChunks, sliceBytes } from "./fakeFetch";

describe("streamChunks + sliceBytes", () => {
  it("sliceBytes('hello', 2) → ['he','ll','o'] as Uint8Arrays", () => {
    const out = sliceBytes("hello", 2);
    const decoder = new TextDecoder();
    expect(out.map((b) => decoder.decode(b))).toEqual(["he", "ll", "o"]);
  });

  it("streamChunks yields in order", async () => {
    const it = streamChunks(["ab", "cd"])[Symbol.asyncIterator]();
    const a = await it.next();
    const b = await it.next();
    const c = await it.next();
    expect(new TextDecoder().decode(a.value as Uint8Array)).toBe("ab");
    expect(new TextDecoder().decode(b.value as Uint8Array)).toBe("cd");
    expect(c.done).toBe(true);
  });
});

describe("fakeFetch", () => {
  it("matches URL + method + headers and returns a JSON response", async () => {
    const f = fakeFetch({
      expectUrl: "https://api.example.com/v1/chat",
      expectMethod: "POST",
      expectHeaders: { Authorization: "Bearer test-key" },
      response: { status: 200, body: { ok: true } },
    });
    const r = await f("https://api.example.com/v1/chat", {
      method: "POST",
      headers: { Authorization: "Bearer test-key" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("body matcher receives the parsed JSON", async () => {
    let seen: unknown = null;
    const f = fakeFetch({
      expectBody: (b) => {
        seen = b;
      },
      response: { status: 200, body: {} },
    });
    await f("https://x", { method: "POST", body: JSON.stringify({ a: 1, b: [2, 3] }) });
    expect(seen).toEqual({ a: 1, b: [2, 3] });
  });

  it("returns a streaming Response from `response.stream`", async () => {
    const f = fakeFetch({
      response: { stream: streamChunks(["data: hello\n\n"]) },
    });
    const r = await f("https://x");
    const reader = r.body!.getReader();
    const chunk = await reader.read();
    expect(new TextDecoder().decode(chunk.value as Uint8Array)).toBe("data: hello\n\n");
    await reader.read();
  });

  it("AbortSignal pre-aborted → rejects with AbortError", async () => {
    const f = fakeFetch({ response: { body: {} } });
    const ctrl = new AbortController();
    ctrl.abort();
    let thrown: unknown = null;
    try {
      await f("https://x", { signal: ctrl.signal });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as Error).name).toBe("AbortError");
  });

  it("`reject: 'AbortError'` short-circuits the call", async () => {
    const f = fakeFetch({ reject: "AbortError" });
    let thrown: unknown = null;
    try {
      await f("https://x");
    } catch (e) {
      thrown = e;
    }
    expect((thrown as Error).name).toBe("AbortError");
  });

  it("`reject: 'TypeError'` simulates a network error", async () => {
    const f = fakeFetch({ reject: "TypeError" });
    await expect(f("https://x")).rejects.toBeInstanceOf(TypeError);
  });

  it("AbortSignal aborted mid-stream → the ReadableStream errors with AbortError on next pull", async () => {
    const ctrl = new AbortController();
    const f = fakeFetch({
      response: { stream: streamChunks(["one", "two", "three"], 1) },
    });
    const r = await f("https://x", { signal: ctrl.signal });
    const reader = r.body!.getReader();
    const first = await reader.read();
    expect(first.value).toBeDefined();
    ctrl.abort();
    let thrown: unknown = null;
    try {
      await reader.read();
    } catch (e) {
      thrown = e;
    }
    expect((thrown as Error).name).toBe("AbortError");
  });

  it("URL regex matcher", async () => {
    const f = fakeFetch({ expectUrl: /\/v1\/embeddings$/, response: { body: { ok: true } } });
    const r = await f("https://api.example.com/v1/embeddings");
    expect(r.status).toBe(200);
  });

  it("calling past the end of the spec list throws", async () => {
    const f = fakeFetch([{ response: { body: {} } }]);
    await f("https://x");
    await expect(f("https://x")).rejects.toThrow(/unexpected extra call/);
  });
});
