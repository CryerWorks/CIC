import { z } from "zod";
import { resourceKind } from "./enums";
import { jsonColumn, jsonObject } from "./_shared";

/** Studied reference material (book, PDF, video…). First-class per Course. `ingested_at` is
 *  non-null only once AI-ingested into the RAG corpus (that feature owns ingestion). `metadata`
 *  is a kind-specific JSON object whose detailed shape the Resource feature validates later. */
export const ResourceSchema = z.object({
  id: z.string(),
  /** Owning vault (Feature 010, migration m0004) — scopes the registry per active vault. */
  vault_id: z.string().nullable(),
  title: z.string(),
  kind: resourceKind,
  file_path: z.string().nullable(),
  url: z.string().nullable(),
  metadata: jsonColumn(jsonObject),
  ingested_at: z.string().nullable(),
  added_at: z.string(),
});

export type Resource = z.infer<typeof ResourceSchema>;
