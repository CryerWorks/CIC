import { z } from "zod";
import { jsonColumn, jsonObject } from "./_shared";

/** SRS flashcard. `front`/`back` are SRS artifacts (per PRD §8) — legitimately stored here,
 *  unlike note bodies; the source note lives in the vault via `note_path`. `fsrs_state` is an
 *  opaque-but-well-formed JSON object whose real shape the SRS feature owns (not scheduled here). */
export const CardSchema = z.object({
  id: z.string(),
  course_id: z.string(),
  project_id: z.string().nullable(),
  note_path: z.string().nullable(),
  front: z.string(),
  back: z.string(),
  fsrs_state: jsonColumn(jsonObject).nullable(),
  due_at: z.string().nullable(),
  last_reviewed: z.string().nullable(),
  created_at: z.string(),
});

export type Card = z.infer<typeof CardSchema>;
