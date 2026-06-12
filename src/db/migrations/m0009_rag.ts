import type { Migration } from "../migrate";

/**
 * Feature 017 (RAG Ingestion Pipeline, PRD F10.2) — vector store schema. Additive only
 * (research R6), schema 8 → 9. Adds three new tables + one sqlite-vec virtual table:
 *
 * - `chunks` — metadata for each text chunk (source, heading path, content hash, offsets)
 * - `chunks_vec` — sqlite-vec vec0 virtual table storing float32 embeddings
 * - `resource_map` — links chunks to Resources + optional Milestones
 * - `indexed_notes` — tracks which vault notes are in the corpus
 *
 * All tables are vault-scoped (FK cascade). `chunks.source_kind` discriminates
 * 'resource' (imported literature) from 'note' (personal vault note).
 * `content_hash` enables incremental re-ingestion (skip unchanged chunks).
 *
 * IMMUTABLE once shipped.
 */
export const m0009Rag: Migration = {
  version: 9,
  name: "rag",
  sql: `
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('resource', 'note')),
  source_id TEXT NOT NULL,
  source_title TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading_path TEXT,
  text_content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  char_offset_start INTEGER NOT NULL,
  char_offset_end INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_kind, source_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS resource_map (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  locator TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexed_notes (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  note_path TEXT NOT NULL,
  title TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  last_indexed_at TEXT NOT NULL,
  UNIQUE(vault_id, note_path)
);

CREATE INDEX IF NOT EXISTS idx_chunks_vault ON chunks(vault_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_kind, source_id);
CREATE INDEX IF NOT EXISTS idx_resource_map_resource ON resource_map(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_map_milestone ON resource_map(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_indexed_notes_vault ON indexed_notes(vault_id);
`.trim(),
};
