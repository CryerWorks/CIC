import { z } from "zod";
import { sqliteBool } from "./_shared";

/** A single source (reading/watching) assigned to a learning session. Created during course
 *  blueprint materialization (v2.1+) and enriched with completion tracking in the Daily Loop.
 *  `completed` is tracked per-source so the Feynman step can gate on all sources done. */
export const SessionSourceSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  resource_id: z.string().nullable(),
  title: z.string(),
  url: z.string(),
  type: z.enum(["reading", "watching"]),
  estimated_minutes: z.number().int(),
  ordering: z.number().int(),
  thumbnail_url: z.string(),
  start_page: z.number().int().nullable(),
  end_page: z.number().int().nullable(),
  start_seconds: z.number().int().nullable(),
  end_seconds: z.number().int().nullable(),
  description: z.string(),
  completed: sqliteBool,
});

export type SessionSourceRow = z.infer<typeof SessionSourceSchema>;
