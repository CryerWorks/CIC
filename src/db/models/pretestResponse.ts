import { z } from "zod";
import { sqliteBool } from "./_shared";

/** Errorful-generation capture (F2.5). Pretest answers are *expected* to be wrong; the
 *  response is recorded as-is, never graded here. */
export const PretestResponseSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  question: z.string(),
  user_response: z.string().nullable(),
  revealed_after: sqliteBool,
});

export type PretestResponse = z.infer<typeof PretestResponseSchema>;
