/**
 * parseCitations — Parse `[source: Name, locator]` markers from AI response text.
 *
 * The Socratic system prompt instructs the AI to reference sources with the format:
 *   `[source: Chapter X] …your question…`
 *
 * Returns an ordered array of text and citation segments for inline rendering.
 * Markers that don't match the expected pattern are left as literal text.
 */

const CITATION_MARKER = /\[source:\s*([^,\]]+?)\s*,\s*([^\]]+?)\s*\]/g;

export interface TextSegment {
  type: "text";
  text: string;
}

export interface CitationSegment {
  type: "citation";
  sourceName: string;
  locator: string;
}

export type ContentSegment = TextSegment | CitationSegment;

/**
 * Split content into text and citation segments.
 *
 * Example:
 *   "In [source: Baby Rudin, page 42], the concept…"
 *   → [{ type: "text", text: "In " },
 *      { type: "citation", sourceName: "Baby Rudin", locator: "page 42" },
 *      { type: "text", text: ", the concept…" }]
 */
export function parseCitations(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CITATION_MARKER.lastIndex = 0;

  while ((match = CITATION_MARKER.exec(content)) !== null) {
    // Text before this marker
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        text: content.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: "citation",
      sourceName: match[1].trim(),
      locator: match[2].trim(),
    });

    lastIndex = CITATION_MARKER.lastIndex;
  }

  // Remaining text after last marker
  if (lastIndex < content.length) {
    segments.push({
      type: "text",
      text: content.slice(lastIndex),
    });
  }

  // If no markers found, return a single text segment
  if (segments.length === 0) {
    segments.push({ type: "text", text: content });
  }

  return segments;
}
