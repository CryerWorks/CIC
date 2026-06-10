/**
 * Native-HTTP fetch seam (Feature 016 — CORS fix). The WebView2 webview enforces CORS on the
 * global `fetch`, but local LLM servers (Ollama, LM Studio, llama.cpp, vLLM, …) send no
 * `Access-Control-Allow-Origin` header — so a request that the server happily answers is blocked
 * from the JS side and surfaces as a `TypeError` ("Failed to fetch"). `@tauri-apps/plugin-http`'s
 * `fetch` runs the request natively in Rust (reqwest), outside the webview origin, so CORS never
 * applies; its `Response.body` is a real incrementally-delivering `ReadableStream<Uint8Array>`
 * (plugin ≥2.4.1), so SSE/NDJSON token streaming keeps working unchanged.
 *
 * This file is INSIDE the ESLint-confined `src/ai/adapters/**` boundary so it may import the
 * plugin; nothing outside the adapters layer imports `@tauri-apps/plugin-http` directly. The
 * composition root (`AIProvider`) injects `tauriFetch` as each adapter's `fetchFn`; tests inject
 * their own fake fetch and never reach this module.
 *
 * The plugin is imported LAZILY (dynamic import on first call) so jsdom/Vitest never loads the
 * Tauri HTTP runtime at module-eval time — the import only happens in the real app, on the first
 * provider call.
 */

let cachedFetch: typeof fetch | null = null;

/** A `typeof fetch`-shaped function backed by Tauri's native HTTP plugin (CORS-free, streaming). */
export const tauriFetch: typeof fetch = async (input, init) => {
  if (!cachedFetch) {
    const mod = await import("@tauri-apps/plugin-http");
    cachedFetch = mod.fetch as typeof fetch;
  }
  return cachedFetch(input, init);
};
