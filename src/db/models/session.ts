import { z } from "zod";
import { sqliteBool } from "./_shared";

/** A Daily Loop session. Two-phase (Feature 012): `status` is `planned` once established and
 *  `completed` once done. `date` is the planned/creation time; `completed_at` is set on finish;
 *  `writeup_path` links to the vault session note (written on finish). */
export const SessionSchema = z.object({
  id: z.string(),
  course_id: z.string(),
  project_id: z.string().nullable(),
  date: z.string(),
  objective: z.string().nullable(),
  minutes: z.number().int(),
  did_retrieval: sqliteBool,
  writeup_path: z.string().nullable(),
  status: z.enum(["planned", "completed"]),
  completed_at: z.string().nullable(),
});

export type Session = z.infer<typeof SessionSchema>;
