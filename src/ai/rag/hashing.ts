/**
 * SHA-256 content hashing for incremental re-ingestion.
 * Uses Web Crypto API (available in browsers, Tauri webview, and Node.js 19+).
 */
export async function hashContent(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Find chunks whose content_hash matches existing stored chunks for the same source.
 * Returns the set of content hashes that can be skipped during re-ingestion.
 * The caller must still re-check against the actual stored hashes.
 */
export function findUnchangedContentHashes(
  existingHashes: Map<string, string>, // contentHash → chunkId
  newChunks: { contentHash: string }[],
): Set<string> {
  const unchanged = new Set<string>();
  for (const chunk of newChunks) {
    if (existingHashes.has(chunk.contentHash)) {
      unchanged.add(chunk.contentHash);
    }
  }
  return unchanged;
}
