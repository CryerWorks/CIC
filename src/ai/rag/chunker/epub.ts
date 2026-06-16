import type { ChunkInput } from "../types";

export interface ParsedEpub {
  title: string;
  chapters: EpubChapter[];
}

export interface EpubChapter {
  /** Chapter title from TOC */
  title: string;
  /** Heading path from TOC hierarchy (e.g., "Part I > Chapter 1") */
  headingPath: string;
  /** Chapter text (stripped HTML) */
  text: string;
  /** Spine item id */
  id: string;
  /** Sequential index in spine */
  index: number;
}

/**
 * Parse an EPUB file into structured chapters with text and TOC hierarchy.
 * Dynamically imports epub2 so the Node.js-only dependency isn't bundled
 * into the Tauri webview until the user actually opens an EPUB.
 */
export async function parseEpub(filePath: string): Promise<ParsedEpub> {
  const EPub = (await import("epub2")).default;
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath);

    epub.on("end", () => {
      try {
        const title = epub.metadata?.title ?? "Untitled EPUB";
        const spineItems = epub.spine?.contents ?? [];
        const tocItems = epub.toc ?? [];

        // Build a TOC map: spine item id → TocElement for heading path
        const tocById = new Map<string, { title: string; headingPath: string }>();

        // Walk TOC to build heading paths
        function walkToc(
          items: typeof tocItems,
          parentPath: string[],
          idMap: Map<string, { title: string; headingPath: string }>,
        ) {
          for (const item of items) {
            if (item.id) {
              const path = [...parentPath, item.title ?? ""].filter(Boolean);
              idMap.set(item.id, {
                title: item.title ?? "",
                headingPath: path.join(" > "),
              });
              const subItems = (item as unknown as Record<string, unknown>).sub as typeof tocItems | undefined;
              if (Array.isArray(subItems) && subItems.length > 0) {
                walkToc(subItems, path, idMap);
              }
            }
          }
        }

        walkToc(tocItems, [], tocById);

        const chapters: EpubChapter[] = [];
        let pending = spineItems.length;
        let hasError = false;

        if (pending === 0) {
          resolve({ title, chapters: [] });
          return;
        }

        for (let i = 0; i < spineItems.length; i++) {
          const item = spineItems[i];

          epub.getChapter(item.id!, (err: Error | null, text?: string) => {
            if (hasError) return;

            if (err) {
              hasError = true;
              reject(new Error(`Failed to read EPUB chapter "${item.id}": ${err.message}`));
              return;
            }

            const tocInfo = tocById.get(item.id!);
            const cleanText = stripHtml(text ?? "");

            chapters.push({
              title: tocInfo?.title ?? item.title ?? `Chapter ${i + 1}`,
              headingPath: tocInfo?.headingPath ?? "",
              text: cleanText,
              id: item.id!,
              index: i,
            });

            pending--;
            if (pending === 0) {
              chapters.sort((a, b) => a.index - b.index);
              resolve({ title, chapters });
            }
          });
        }
      } catch (err) {
        reject(err);
      }
    });

    epub.on("error", (err: Error) => {
      reject(err);
    });

    epub.parse();
  });
}

/**
 * Strip HTML tags and decode entities from chapter text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p[^>]*>/gi, "\n")
    .replace(/<\/?div[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Chunk an EPUB into ChunkInput[] using TOC structure.
 * Each chapter becomes one or more chunks.
 * Oversized chapters are split by paragraphs.
 */
export function chunkEpub(
  parsed: ParsedEpub,
  sourceId: string,
  vaultId: string,
  maxChunkSize = 2000,
): { title: string; chunks: ChunkInput[] } {
  const chunks: ChunkInput[] = [];
  let chunkIndex = 0;
  let charOffset = 0;

  for (const chapter of parsed.chapters) {
    if (!chapter.text.trim()) continue;

    const headingPath = chapter.headingPath || chapter.title;

    if (chapter.text.length <= maxChunkSize) {
      chunks.push({
        id: crypto.randomUUID(),
        vaultId,
        sourceKind: "resource",
        sourceId,
        sourceTitle: parsed.title,
        chunkIndex: chunkIndex++,
        headingPath: chapter.headingPath || chapter.title || null,
        textContent: chapter.text,
        contentHash: "", // filled by ingestor
        charOffsetStart: charOffset,
        charOffsetEnd: charOffset + chapter.text.length,
        embedding: new Float32Array(0), // filled by embedder
      });
      charOffset += chapter.text.length;
    } else {
      // Split oversized chapters by paragraphs (double newline)
      const paragraphs = chapter.text.split(/\n\n+/);
      let currentChunk = "";
      let paraStartInChapter = 0;

      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        if (currentChunk && currentChunk.length + trimmed.length + 2 > maxChunkSize) {
          chunks.push({
            id: crypto.randomUUID(),
            vaultId,
            sourceKind: "resource",
            sourceId,
            sourceTitle: parsed.title,
            chunkIndex: chunkIndex++,
            headingPath,
            textContent: currentChunk.trim(),
            contentHash: "", // filled by ingestor
            charOffsetStart: charOffset + paraStartInChapter,
            charOffsetEnd: charOffset + paraStartInChapter + currentChunk.length,
            embedding: new Float32Array(0),
          });
          currentChunk = trimmed;
          paraStartInChapter += currentChunk.length + 2;
        } else {
          currentChunk = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;
        }
      }

      if (currentChunk.trim()) {
        chunks.push({
          id: crypto.randomUUID(),
          vaultId,
          sourceKind: "resource",
          sourceId,
          sourceTitle: parsed.title,
          chunkIndex: chunkIndex++,
          headingPath,
          textContent: currentChunk.trim(),
          contentHash: "", // filled by ingestor
          charOffsetStart: charOffset + paraStartInChapter,
          charOffsetEnd: charOffset + chapter.text.length,
          embedding: new Float32Array(0),
        });
      }

      charOffset += chapter.text.length;
    }
  }

  return { title: parsed.title, chunks };
}
