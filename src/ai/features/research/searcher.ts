/**
 * WebSearchProvider interface + adapters for the AI Research Agent (F11).
 *
 * Two adapters:
 * 1. SearXNGAdapter — connects to a self-hosted SearXNG instance via its JSON API
 * 2. ManualAdapter — returns user-provided URLs (for users without a search engine)
 */

import type { WebSearchProvider, WebSearchResult, ResearchSourceType } from "./types";

/**
 * Adapter for SearXNG — a self-hosted privacy-respecting metasearch engine.
 *
 * Configuration: `research.search_url` setting should point to the SearXNG instance
 * (e.g. "http://localhost:8888"). Falls back to ManualAdapter if unset.
 */
export class SearXNGAdapter implements WebSearchProvider {
  private readonly searchUrl: string;
  private readonly fetchImpl: typeof fetch;

  /**
   * @param searchUrl - Base URL of the SearXNG instance (without trailing /search).
   * @param fetchImpl - Optional fetch implementation (default: global fetch).
   */
  constructor(searchUrl: string, fetchImpl?: typeof fetch) {
    // Normalize: strip trailing slash and /search path
    this.searchUrl = searchUrl.replace(/\/+$/, "").replace(/\/search$/, "");
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
  }

  /**
   * Search via SearXNG JSON API.
   * Returns categorized results with source type classification.
   */
  async search(query: string, count = 10): Promise<WebSearchResult[]> {
    if (!query.trim()) return [];

    const params = new URLSearchParams({
      q: query,
      format: "json",
      language: "en",
      categories: "general, science, it",
      pageno: "1",
    });

    const url = `${this.searchUrl}/search?${params.toString()}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      throw new Error(
        `SearXNG request failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `SearXNG returned HTTP ${response.status}: ${response.statusText}`,
      );
    }

    let body: SearXNGResponse;
    try {
      body = (await response.json()) as SearXNGResponse;
    } catch {
      throw new Error("SearXNG returned invalid JSON");
    }

    if (!body.results || !Array.isArray(body.results)) {
      return [];
    }

    return body.results.slice(0, count).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: r.content ?? r.title ?? "",
      sourceType: classifySourceType(r),
    }));
  }
}

/**
 * Manual URL adapter — returns user-provided URLs as search results.
 * Used when no SearXNG instance is configured.
 */
export class ManualAdapter implements WebSearchProvider {
  private urls: WebSearchResult[] = [];

  /** Set the URLs the user has manually provided. */
  setUrls(urls: WebSearchResult[]): void {
    this.urls = [...urls];
  }

  /** Add a single URL manually. */
  addUrl(url: string, title?: string, snippet?: string, sourceType?: ResearchSourceType): void {
    this.urls.push({
      url,
      title: title ?? url,
      snippet: snippet ?? "",
      sourceType: sourceType ?? "other",
    });
  }

  /** Clear all manually entered URLs. */
  clear(): void {
    this.urls = [];
  }

  /** Returns the list of manually entered URLs. */
  async search(_query: string, _count?: number): Promise<WebSearchResult[]> {
    void _query; void _count;
    return this.urls;
  }
}

/**
 * Create the appropriate WebSearchProvider based on configuration.
 * If searchUrl is provided and non-empty, returns SearXNGAdapter.
 * Otherwise returns ManualAdapter.
 */
export function createSearchProvider(searchUrl?: string): WebSearchProvider {
  if (searchUrl && searchUrl.trim().length > 0) {
    return new SearXNGAdapter(searchUrl.trim());
  }
  return new ManualAdapter();
}

// ── Internal helpers ──

interface SearXNGResult {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  category?: string;
  template?: string;
  parsed_url?: string[];
}

interface SearXNGResponse {
  query?: string;
  results?: SearXNGResult[];
  suggestions?: string[];
  answers?: string[];
  infoboxes?: unknown[];
}

/** Classify the result source type based on SearXNG metadata. */
function classifySourceType(result: SearXNGResult): ResearchSourceType {
  const category = result.category ?? "";
  const engine = result.engine ?? "";
  const url = result.url ?? "";
  const title = result.title ?? "";

  // Video platforms
  if (
    engine.includes("youtube") ||
    engine.includes("vimeo") ||
    category.includes("video") ||
    url.match(/youtube\.com|youtu\.be|vimeo\.com|udemy\.com/)
  ) {
    return "video";
  }

  // Course/courseware platforms
  if (
    category.includes("science") ||
    url.match(/coursera\.org|edx\.org|khanacademy|udacity|mit\.edu\/courses/)
  ) {
    return "courseware";
  }

  // Textbook-like domains
  if (
    title.match(/textbook|handbook|guide|reference/i) ||
    url.match(/wiki(pedia)?\.org|github\.io|readthedocs|docs\./)
  ) {
    return "textbook";
  }

  // Syllabi
  if (
    title.match(/syllabus|curriculum|course outline/i) ||
    category.includes("syllabus")
  ) {
    return "syllabus";
  }

  // Blog articles, general content
  if (
    engine.includes("news") ||
    engine.includes("blog") ||
    category.includes("general") ||
    url.match(/\.com\/blog|medium\.com|dev\.to/)
  ) {
    return "article";
  }

  return "other";
}
