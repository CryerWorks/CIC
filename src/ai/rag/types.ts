import { z } from "zod";

// ── Core types for the RAG ingestion + retrieval pipeline (Feature 017) ──

export const CHUNK_SOURCE_KINDS = ["resource", "note"] as const;
export type ChunkSourceKind = (typeof CHUNK_SOURCE_KINDS)[number];

export interface ChunkInput {
  id: string;
  vaultId: string;
  sourceKind: ChunkSourceKind;
  sourceId: string;
  sourceTitle: string;
  chunkIndex: number;
  headingPath: string | null;
  textContent: string;
  contentHash: string;
  charOffsetStart: number;
  charOffsetEnd: number;
  embedding: Float32Array;
}

export const ChunkRowSchema = z.object({
  id: z.string(),
  vault_id: z.string(),
  source_kind: z.enum(CHUNK_SOURCE_KINDS),
  source_id: z.string(),
  source_title: z.string(),
  chunk_index: z.number().int().min(0),
  heading_path: z.string().nullable(),
  text_content: z.string(),
  content_hash: z.string().length(64),
  char_offset_start: z.number().int().min(0),
  char_offset_end: z.number().int().min(0),
  created_at: z.string(),
});

export type ChunkRow = z.infer<typeof ChunkRowSchema>;

export const SearchFilterSchema = z.object({
  sourceKind: z.enum(CHUNK_SOURCE_KINDS).optional(),
  resourceId: z.string().optional(),
  courseId: z.string().optional(),
});

export type SearchFilter = z.infer<typeof SearchFilterSchema>;

export interface SearchResult {
  chunk: ChunkRow;
  distance: number;
  resourceId: string | null;
  milestoneId: string | null;
  locator: string;
}

export const SourceStatsSchema = z.object({
  sourceKind: z.enum(CHUNK_SOURCE_KINDS),
  sourceId: z.string(),
  sourceTitle: z.string(),
  chunkCount: z.number().int().min(0),
  lastUpdated: z.string(),
});

export type SourceStats = z.infer<typeof SourceStatsSchema>;

export interface IngestResult {
  sourceId: string;
  sourceTitle: string;
  chunkCount: number;
  ingestedAt: string;
  skippedCount: number;
  apiCalls: number;
}

export interface IngestState {
  type: "resource" | "note";
  sourceTitle: string;
  status: "parsing" | "chunking" | "embedding" | "storing" | "done" | "error";
  progress: { current: number; total: number };
  error?: string;
}

export const IndexedNoteSchema = z.object({
  id: z.string(),
  vault_id: z.string(),
  note_path: z.string(),
  title: z.string(),
  chunk_count: z.number().int().min(0),
  last_indexed_at: z.string(),
});

export type IndexedNoteRow = z.infer<typeof IndexedNoteSchema>;

export const ResourceMapSchema = z.object({
  id: z.string(),
  chunk_id: z.string(),
  resource_id: z.string(),
  milestone_id: z.string().nullable(),
  locator: z.string(),
});

export type ResourceMapRow = z.infer<typeof ResourceMapSchema>;
