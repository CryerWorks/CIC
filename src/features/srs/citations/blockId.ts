/**
 * Deterministic Obsidian block-ids for note citations (F3.6 / R7). The id is a content hash of the
 * paragraph (FNV-1a → 8 hex), so re-citing the same paragraph yields the same `^id` and never
 * builds up duplicate markers. Not cryptographic — uniqueness/determinism is all that's needed.
 */
export function blockIdFor(paragraph: string): string {
  const s = paragraph.trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "cic-" + (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Append ` ^<id>` to the paragraph's line if it isn't already marked. Idempotent (a second call is
 * a no-op) and targeted (only the matching line changes). Returns the new body, the block-id, and
 * whether anything changed. If the paragraph isn't found, the body is returned unchanged.
 */
export function ensureBlockMarker(
  body: string,
  paragraph: string,
): { body: string; blockId: string; changed: boolean } {
  const blockId = blockIdFor(paragraph);
  const marker = `^${blockId}`;
  const target = paragraph.trim();
  const lines = body.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    const withoutMarker = trimmed.replace(/\s*\^[\w-]+$/, "").trimEnd();
    if (withoutMarker !== target) continue;
    if (trimmed.endsWith(marker)) return { body, blockId, changed: false };
    lines[i] = `${withoutMarker} ${marker}`;
    return { body: lines.join("\n"), blockId, changed: true };
  }
  return { body, blockId, changed: false };
}
