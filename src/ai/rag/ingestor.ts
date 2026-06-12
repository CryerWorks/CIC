import type { SqlExecutor } from "../../db/executor";
import type { AIRouter } from "../router";
import type { VectorStore } from "./vectorStore";
import type { ChunkInput, IngestResult } from "./types";
import { chunkMarkdown } from "./chunker/markdown";
import { chunkEpub, parseEpub } from "./chunker/epub";
import { embedChunks } from "./embedder";
import { hashContent } from "./hashing";

export interface IngestMarkdownInput {
  resourceId: string;
  vaultId: string;
  title: string;
  rawText: string;
  existingHashes?: Map<string, string>;
  signal?: AbortSignal;
}

export interface IngestEpubInput {
  resourceId: string;
  vaultId: string;
  title: string;
  filePath: string;
  existingHashes?: Map<string, string>;
  signal?: AbortSignal;
}

/**
 * Common pipeline: hash chunks → filter unchanged (incremental) → delete old → embed new → store → update ingested_at.
 */
async function runIngestion(
  db: SqlExecutor,
  vectorStore: VectorStore,
  router: AIRouter,
  rawChunks: ChunkInput[],
  sourceId: string,
  sourceTitle: string,
  existingHashes: Map<string, string>,
  signal?: AbortSignal,
): Promise<IngestResult> {
  if (rawChunks.length === 0) {
    return {
      sourceId,
      sourceTitle,
      chunkCount: 0,
      ingestedAt: new Date().toISOString(),
      skippedCount: 0,
      apiCalls: 0,
    };
  }

  // Compute content hashes
  const hashPromises = rawChunks.map((c) => hashContent(c.textContent));
  const hashes = await Promise.all(hashPromises);
  for (let i = 0; i < rawChunks.length; i++) {
    rawChunks[i].contentHash = hashes[i];
  }

  // Determine which chunks need embedding (incremental re-ingestion)
  let chunksToEmbed = rawChunks;
  let skippedCount = 0;

  if (existingHashes.size > 0) {
    const changed: ChunkInput[] = [];
    for (const c of rawChunks) {
      if (!existingHashes.has(c.contentHash)) {
        changed.push(c);
      }
    }
    skippedCount = rawChunks.length - changed.length;
    chunksToEmbed = changed;
  }

  // Embed new/modified chunks BEFORE deleting old data, so a lockdown/network error
  // preserves the previous state (FR-012 atomic ingestion invariant).
  let embeddedChunks: ChunkInput[] = [];
  let apiCalls = 0;
  if (chunksToEmbed.length > 0) {
    const result = await embedChunks(chunksToEmbed, router, signal);
    embeddedChunks = result.chunks;
    apiCalls = result.apiCalls;
  }

  // Now replace old chunks
  await vectorStore.deleteBySource("resource", sourceId);

  // Store all chunks
  if (embeddedChunks.length > 0) {
    await vectorStore.insertChunks(embeddedChunks);
  }

  // Update resource.ingested_at
  await db.execute(
    `UPDATE resources SET ingested_at = ? WHERE id = ?`,
    [new Date().toISOString(), sourceId],
  );

  return {
    sourceId,
    sourceTitle,
    chunkCount: rawChunks.length,
    ingestedAt: new Date().toISOString(),
    skippedCount,
    apiCalls,
  };
}

/**
 * Full ingestion pipeline for Markdown resources.
 */
export async function ingestMarkdown(
  db: SqlExecutor,
  vectorStore: VectorStore,
  router: AIRouter,
  input: IngestMarkdownInput,
): Promise<IngestResult> {
  const doc = chunkMarkdown(
    input.rawText,
    "resource",
    input.resourceId,
    input.title,
    input.vaultId,
  );

  return runIngestion(
    db,
    vectorStore,
    router,
    doc.chunks,
    input.resourceId,
    input.title,
    input.existingHashes ?? new Map(),
    input.signal,
  );
}

/**
 * Full ingestion pipeline for EPUB resources.
 * Parses the EPUB file, extracts chapter text, chunks by TOC, embeds, stores.
 */
export async function ingestEpub(
  db: SqlExecutor,
  vectorStore: VectorStore,
  router: AIRouter,
  input: IngestEpubInput,
): Promise<IngestResult> {
  // Parse EPUB file
  const parsed = await parseEpub(input.filePath);

  // Chunk by TOC structure
  const doc = chunkEpub(parsed, input.resourceId, input.vaultId);

  return runIngestion(
    db,
    vectorStore,
    router,
    doc.chunks,
    input.resourceId,
    input.title || parsed.title,
    input.existingHashes ?? new Map(),
    input.signal,
  );
}
