/**
 * Web page fetcher + Markdown converter stub (Feature 022 / F11).
 *
 * v1: Stub — returns URLs as-is without fetching content.
 * v1.1: Will use Rust readability crate + turndown to extract article
 * content from web pages and convert to Markdown.
 *
 * TODO(v1.1): Integrate Rust readability crate for article extraction.
 * TODO(v1.1): Integrate Rust turndown crate for HTML → Markdown conversion.
 */

import type { ResearchSource } from "./types";

export interface FetchResult {
  url: string;
  title: string;
  markdown: string | null;
  error?: string;
}

/**
 * Fetch a web page and extract its main content as Markdown.
 * v1: Stub — returns null content (URL-only mode).
 * v1.1: Will use Rust readability + turndown via Tauri invoke.
 */
export async function fetchPageAsMarkdown(url: string, _title?: string): Promise<FetchResult> {
  // v1: Stub — return URL without content
  // In v1.1, this will call a Tauri Rust command:
  //   const result = await invoke('fetch_and_convert', { url });
  return {
    url,
    title: _title ?? url,
    markdown: null,
  };
}

/**
 * Fetch multiple pages concurrently.
 * v1: Returns all sources with null markdown.
 */
export async function fetchPagesAsMarkdown(
  sources: ResearchSource[],
): Promise<FetchResult[]> {
  return Promise.all(
    sources.map((s) => fetchPageAsMarkdown(s.url, s.title)),
  );
}
