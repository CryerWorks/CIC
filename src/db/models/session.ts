import { z } from "zod";
import { sqliteBool } from "./_shared";

/** One run of the Daily Loop. `writeup_path` links to the vault session note. */
export const SessionSchema = z.object({
  id: z.string(),
  course_id: z.string(),
  project_id: z.string().nullable(),
  date: z.string(),
  objective: z.string().nullable(),
  minutes: z.number().int(),
  did_retrieval: sqliteBool,
  writeup_path: z.string().nullable(),
});

export type Session = z.infer<typeof SessionSchema>;
