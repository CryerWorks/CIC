/**
 * Note indexer — index/unindex vault notes into the RAG corpus (Feature 017, F10.2).
 * Stateless functions: injectable deps let it work in Tauri and Vitest contexts.
 * Notes are chunked via the same Markdown pipeline as Resources, stored with
 * `source_kind = "note"`, and tracked in `indexed_notes`.
 */
import type { SqlExecutor } from "../../db";
import type { VectorStore } from "./vectorStore";
import type { AIRouter } from "../router";
import type { IngestResult } from "./types";
import { chunkMarkdown } from "./chunker/markdown";
import { embedChunks } from "./embedder";
import { hashContent } from "./hashing";

export interface IndexNoteInput {
  noteContent: string;
  notePath: string;
  title: string;
  vaultId: string;
  db: SqlExecutor;
  vectorStore: VectorStore;
  router: AIRouter;
}

export async function indexNote(input: IndexNoteInput): Promise<IngestResult> {
  const { noteContent, notePath, title, vaultId, db, vectorStore, router } = input;
  const startedAt = new Date().toISOString();

  const doc = chunkMarkdown(noteContent, "note", notePath, title, vaultId);

  let skippedCount = 0;
  for (const c of doc.chunks) {
    c.contentHash = await hashContent(c.textContent);
  }

  const existing = new Set(await vectorStore.getSourceHashes("note", notePath));
  const changed = doc.chunks.filter((c) => {
    if (existing.has(c.contentHash)) { skippedCount++; return false; }
    return true;
  });

  let apiCalls = 0;
  if (changed.length > 0) {
    const embedResult = await embedChunks(changed, router);
    apiCalls = embedResult.apiCalls;
    await vectorStore.deleteBySource("note", notePath);
    await vectorStore.insertChunks(embedResult.chunks);
  } else if (doc.chunks.length === 0) {
    await vectorStore.deleteBySource("note", notePath);
  }

  // Upsert into indexed_notes (INSERT OR REPLACE handles re-index)
  await db.execute(
    `INSERT INTO indexed_notes (id, vault_id, note_path, title, chunk_count, last_indexed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (vault_id, note_path) DO UPDATE SET
       title = excluded.title,
       chunk_count = excluded.chunk_count,
       last_indexed_at = excluded.last_indexed_at`,
    [crypto.randomUUID(), vaultId, notePath, title, doc.chunks.length, startedAt],
  );

  return {
    sourceId: notePath,
    sourceTitle: title,
    chunkCount: doc.chunks.length,
    ingestedAt: startedAt,
    skippedCount,
    apiCalls,
  };
}

export async function unindexNote(
  db: SqlExecutor,
  vectorStore: VectorStore,
  vaultId: string,
  notePath: string,
): Promise<void> {
  await vectorStore.deleteBySource("note", notePath);
  await db.execute(
    "DELETE FROM indexed_notes WHERE vault_id = ?1 AND note_path = ?2",
    [vaultId, notePath],
  );
}

export async function isNoteIndexed(
  db: SqlExecutor,
  vaultId: string,
  notePath: string,
): Promise<boolean> {
  const rows = await db.select<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM indexed_notes WHERE vault_id = ?1 AND note_path = ?2",
    [vaultId, notePath],
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

export async function getIndexedNotes(
  db: SqlExecutor,
  vaultId: string,
): Promise<Array<{ notePath: string; title: string; chunkCount: number; lastIndexedAt: string }>> {
  const rows = await db.select<Record<string, unknown>>(
    "SELECT note_path, title, chunk_count, last_indexed_at FROM indexed_notes WHERE vault_id = ?1 ORDER BY title",
    [vaultId],
  );
  return rows.map((r) => ({
    notePath: String(r.note_path),
    title: String(r.title),
    chunkCount: Number(r.chunk_count),
    lastIndexedAt: String(r.last_indexed_at),
  }));
}
