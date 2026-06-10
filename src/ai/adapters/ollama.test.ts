import { describe, it, expect } from "vitest";
import { OllamaAdapter } from "./ollama";
import { fakeFetch, streamChunks, InMemorySecretStore as _ } from "../testing/fakeFetch";
import { isProviderError } from "../errors";

void _;

describe("OllamaAdapter — Ollama-specific details", () => {
  it("ECONNREFUSED-style network error → ProviderError('offline', …) with the 'is Ollama running?' message", async () => {
    const fetchFn = fakeFetch({ reject: "TypeError" });
    const adapter = new OllamaAdapter({ id: "ollama", baseUrl: "http://localhost:11434", fetchFn });
    let thrown: unknown = null;
    try {
      for await (const _ of adapter.chat(
        [{ role: "user", content: "hi" }],
        { containsVaultContent: false, model: "llama3.2" },
      ))
        void _;
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) {
      expect(thrown.kind).toBe("offline");
      expect(thrown.message).toMatch(/Ollama/);
      expect(thrown.message).toMatch(/is it running/);
      expect(thrown.message).toContain("http://localhost:11434");
    }
  });

  it("embed iterates the single-input API and preserves order", async () => {
    const fetchFn = fakeFetch([
      { response: { body: { embedding: [1, 2] } } },
      { response: { body: { embedding: [3, 4] } } },
      { response: { body: { embedding: [5, 6] } } },
    ]);
    const adapter = new OllamaAdapter({ id: "ollama", baseUrl: "http://localhost:11434", fetchFn });
    const result = await adapter.embed(["a", "b", "c"], {
      containsVaultContent: false,
      model: "nomic-embed-text",
    });
    expect(result.vectors).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    expect(result.dimensions).toBe(2);
  });

  it("malformed NDJSON → ProviderError('bad_response', …)", async () => {
    const fetchFn = fakeFetch({
      response: {
        stream: streamChunks([
          '{"valid":"json"}\n',
          'this is not json at all\n',
        ]),
      },
    });
    const adapter = new OllamaAdapter({ id: "ollama", baseUrl: "http://localhost:11434", fetchFn });
    let thrown: unknown = null;
    try {
      for await (const _ of adapter.chat([{ role: "user", content: "x" }], { containsVaultContent: false, model: "x" })) void _;
    } catch (e) {
      thrown = e;
    }
    expect(isProviderError(thrown)).toBe(true);
    if (isProviderError(thrown)) expect(thrown.kind).toBe("bad_response");
  });
});
