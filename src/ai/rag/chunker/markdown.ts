import type { ChunkInput } from "../types";

/**
 * Chunk a Markdown string into structural chunks, respecting heading hierarchy.
 * Headings H1–H3 are structural boundaries; H4+ are flattened into their parent
 * section. Frontmatter is excluded from chunk text, but its `title` field is
 * captured. `[[wikilinks]]` and `[links](url)` are preserved verbatim.
 *
 * Feature 017 — no external library; plain regex heading detection (~50 LOC).
 */

const HEADING_RE = /^(#{1,3})\s+(.+)$/m;
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

interface Heading {
  level: number;
  text: string;
  start: number;
}

export interface ChunkedDoc {
  title: string;
  chunks: ChunkInput[];
}

export function chunkMarkdown(
  text: string,
  sourceKind: "resource" | "note",
  sourceId: string,
  sourceTitle: string,
  vaultId: string,
  maxChunkSize = 2000,
): ChunkedDoc {
  // Extract frontmatter title, strip frontmatter from chunking
  let title = sourceTitle;
  const fmMatch = text.match(FRONTMATTER_RE);
  let bodyStart = 0;
  if (fmMatch) {
    bodyStart = fmMatch[0].length;
    const fmText = fmMatch[1];
    const titleMatch = fmText.match(/^title:\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  const body = text.slice(bodyStart).trim();
  if (!body) return { title, chunks: [] };

  // Find all H1–H3 headings in the body
  const headings: Heading[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(HEADING_RE.source, "gm");
  while ((match = re.exec(body)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
      start: match.index,
    });
  }

  // No headings → single chunk
  if (headings.length === 0) {
    return {
      title,
      chunks: splitToChunks(
        [{ text: body, path: null }],
        sourceKind,
        sourceId,
        title,
        vaultId,
        maxChunkSize,
      ),
    };
  }

  // Build sections: each section = [heading, content up to next heading]
  const sections: { text: string; path: string | null }[] = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const contentStart = body.indexOf("\n", h.start) + 1; // after heading line
    const nextStart = i < headings.length - 1 ? headings[i + 1].start : body.length;
    const content = body.slice(contentStart, nextStart).trim();
    if (content) {
      sections.push({
        text: `${h.text}: ${content}`,
        path: h.text,
      });
    }
  }

  // If there's content before the first heading, make it a leading chunk
  if (headings[0].start > 0) {
    const lead = body.slice(0, headings[0].start).trim();
    if (lead) {
      sections.unshift({ text: lead, path: title });
    }
  }

  return {
    title,
    chunks: splitToChunks(sections, sourceKind, sourceId, title, vaultId, maxChunkSize),
  };
}

function splitToChunks(
  sections: { text: string; path: string | null }[],
  sourceKind: "resource" | "note",
  sourceId: string,
  sourceTitle: string,
  vaultId: string,
  maxChunkSize: number,
): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  let chunkIndex = 0;

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    let remaining = section.text;

    while (remaining.length > maxChunkSize) {
      // Split at nearest paragraph boundary within maxChunkSize
      let splitAt = remaining.lastIndexOf("\n\n", maxChunkSize);
      if (splitAt <= 0) splitAt = remaining.lastIndexOf("\n", maxChunkSize);
      if (splitAt <= 0) splitAt = maxChunkSize;

      const part = remaining.slice(0, splitAt).trim();
      if (part) {
        const partLabel =
          sections.length > 1 || remaining.length > maxChunkSize
            ? ` (part ${chunkIndex - chunks.length + 1})`
            : "";
        chunks.push(makeChunk(
          sourceKind, sourceId, sourceTitle, vaultId,
          chunkIndex++, `${section.path ?? sourceTitle}${partLabel}`, part,
        ));
      }
      remaining = remaining.slice(splitAt).trim();
    }

    if (remaining) {
      chunks.push(makeChunk(
        sourceKind, sourceId, sourceTitle, vaultId,
        chunkIndex++, section.path, remaining,
      ));
    }
  }

  return chunks;
}

function makeChunk(
  sourceKind: "resource" | "note",
  sourceId: string,
  sourceTitle: string,
  vaultId: string,
  chunkIndex: number,
  headingPath: string | null,
  textContent: string,
): ChunkInput {
  // Generate deterministic UUID for testability
  const id = `${sourceId}--${chunkIndex}`;
  return {
    id,
    vaultId,
    sourceKind,
    sourceId,
    sourceTitle,
    chunkIndex,
    headingPath,
    textContent,
    contentHash: "", // filled by caller (ingestor) via Web Crypto
    charOffsetStart: 0,
    charOffsetEnd: textContent.length,
    embedding: new Float32Array(0), // filled by embedder
  };
}
