import { z } from "zod";
import { resourceKind } from "./enums";
import { jsonColumn, jsonObject } from "./_shared";

/** Studied reference material (book, PDF, video…). First-class per Course. `ingested_at` is
 *  non-null only once AI-ingested into the RAG corpus (that feature owns ingestion). `metadata`
 *  is a kind-specific JSON object whose detailed shape the Resource feature validates later. */
export const ResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: resourceKind,
  file_path: z.string().nullable(),
  url: z.string().nullable(),
  metadata: jsonColumn(jsonObject),
  ingested_at: z.string().nullable(),
  added_at: z.string(),
});

export type Resource = z.infer<typeof ResourceSchema>;
