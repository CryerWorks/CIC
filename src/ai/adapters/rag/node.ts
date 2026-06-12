/**
 * Node.js VectorStore adapter — used in Vitest tests.
 * Uses better-sqlite3 + sqlite-vec npm package directly (no Tauri runtime).
 *
 * ESLint boundary: this file and src/ai/adapters/rag/tauri.ts are the only
 * files allowed to import sqlite-vec (enforced via no-restricted-imports).
 */
import type Database from "better-sqlite3";
import type { VectorStore } from "../../rag/vectorStore";
import type { ChunkInput, SearchResult, SearchFilter, SourceStats } from "../../rag/types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqliteVec = require("sqlite-vec") as { load(db: Database.Database): void; getLoadablePath(): string };

export function createNodeVectorStore(db: Database.Database): VectorStore {
  let initialized = false;
  let vecDimension = -1;

  function ensureInit(): void {
    if (initialized) return;
    sqliteVec.load(db);
    initialized = true;
  }

  function ensureVecTable(dimension: number): void {
    if (dimension <= 0) throw new Error("Cannot create vec0 table with zero or negative dimension");
    if (vecDimension === dimension) return;
    // For production: each vault's chunks_vec is dimension-locked at creation time.
    // For tests: allow re-creation when the database is new (in-memory).
    // We drop if it exists with different dimensions (test-only pattern).
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(chunk_id TEXT, embedding FLOAT[${dimension}])`,
    );
    vecDimension = dimension;
  }

  function toVecFloat(embedding: Float32Array): Buffer {
    return Buffer.from(embedding.buffer);
  }

  return {
    init(): Promise<void> {
      ensureInit();
      return Promise.resolve();
    },

    insertChunks(chunks: ChunkInput[]): Promise<number> {
      ensureInit();
      if (chunks.length === 0) return Promise.resolve(0);
      ensureVecTable(chunks[0].embedding.length);
      const insertChunk = db.prepare(
        `INSERT OR IGNORE INTO chunks (id, vault_id, source_kind, source_id, source_title, chunk_index, heading_path, text_content, content_hash, char_offset_start, char_offset_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertVec = db.prepare(
        `INSERT INTO chunks_vec (chunk_id, embedding) VALUES (?, vec_f32(?))`,
      );
      const insertMap = db.prepare(
        `INSERT OR IGNORE INTO resource_map (id, chunk_id, resource_id, milestone_id, locator)
         VALUES (?, ?, ?, ?, ?)`,
      );

      const insertAll = db.transaction(() => {
        let count = 0;
        for (const chunk of chunks) {
          insertChunk.run(
            chunk.id,
            chunk.vaultId,
            chunk.sourceKind,
            chunk.sourceId,
            chunk.sourceTitle,
            chunk.chunkIndex,
            chunk.headingPath,
            chunk.textContent,
            chunk.contentHash,
            chunk.charOffsetStart,
            chunk.charOffsetEnd,
          );
          insertVec.run(chunk.id, toVecFloat(chunk.embedding));
          if (chunk.sourceKind === "resource") {
            insertMap.run(
              crypto.randomUUID(),
              chunk.id,
              chunk.sourceId,
              null,
              chunk.headingPath ?? "",
            );
          }
          count++;
        }
        return count;
      });

      const count = insertAll();
      return Promise.resolve(count);
    },

    deleteBySource(sourceKind: "resource" | "note", sourceId: string): Promise<number> {
      ensureInit();
      const result = db
        .prepare("DELETE FROM chunks WHERE source_kind = ? AND source_id = ?")
        .run(sourceKind, sourceId);
      return Promise.resolve(result.changes);
    },

    search(queryVector: Float32Array, k = 10, vaultId: string, filter?: SearchFilter): Promise<SearchResult[]> {
      ensureInit();
      if (vecDimension < 1) return Promise.resolve([]);
      let sql = `
        SELECT c.*, v.distance,
               rm.resource_id, rm.milestone_id, rm.locator
        FROM chunks_vec v
        JOIN chunks c ON c.id = v.chunk_id
        LEFT JOIN resource_map rm ON rm.chunk_id = c.id
        WHERE v.embedding MATCH vec_f32(?) AND k = ?
          AND c.vault_id = ?
      `;
      const params: unknown[] = [toVecFloat(queryVector), k, vaultId];

      if (filter?.sourceKind) {
        sql += " AND c.source_kind = ?";
        params.push(filter.sourceKind);
      }
      if (filter?.resourceId) {
        sql += " AND rm.resource_id = ?";
        params.push(filter.resourceId);
      }

      sql += " ORDER BY v.distance";

      const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

      return Promise.resolve(
        rows.map((r) => ({
          chunk: {
            id: String(r.id),
            vault_id: String(r.vault_id),
            source_kind: r.source_kind as "resource" | "note",
            source_id: String(r.source_id),
            source_title: String(r.source_title),
            chunk_index: Number(r.chunk_index),
            heading_path: r.heading_path ? String(r.heading_path) : null,
            text_content: String(r.text_content),
            content_hash: String(r.content_hash),
            char_offset_start: Number(r.char_offset_start),
            char_offset_end: Number(r.char_offset_end),
            created_at: String(r.created_at),
          },
          distance: Number(r.distance),
          resourceId: r.resource_id ? String(r.resource_id) : null,
          milestoneId: r.milestone_id ? String(r.milestone_id) : null,
          locator: r.locator ? String(r.locator) : "",
        })),
      );
    },

    getSourceStats(vaultId: string): Promise<SourceStats[]> {
      ensureInit();
      const rows = db
        .prepare(
          `SELECT source_kind, source_id, source_title,
                  COUNT(*) as chunk_count, MAX(created_at) as last_updated
           FROM chunks
           WHERE vault_id = ?
           GROUP BY source_kind, source_id, source_title
           ORDER BY source_kind, source_title`,
        )
        .all(vaultId) as Array<Record<string, unknown>>;

      return Promise.resolve(
        rows.map((r) => ({
          sourceKind: r.source_kind as "resource" | "note",
          sourceId: String(r.source_id),
          sourceTitle: String(r.source_title),
          chunkCount: Number(r.chunk_count),
          lastUpdated: r.last_updated ? String(r.last_updated) : "",
        })),
      );
    },

    getChunkCount(vaultId: string): Promise<number> {
      ensureInit();
      const row = db
        .prepare("SELECT COUNT(*) as cnt FROM chunks WHERE vault_id = ?")
        .get(vaultId) as { cnt: number } | undefined;
      return Promise.resolve(row?.cnt ?? 0);
    },

    getSourceHashes(sourceKind: "resource" | "note", sourceId: string): Promise<string[]> {
      ensureInit();
      const rows = db
        .prepare("SELECT content_hash FROM chunks WHERE source_kind = ? AND source_id = ? ORDER BY chunk_index")
        .all(sourceKind, sourceId) as Array<{ content_hash: string }>;
      return Promise.resolve(rows.map((r) => r.content_hash));
    },
  };
}
