import { z } from "zod";

/** An intended SRS card staged while *planning* a session (Feature 012). Materialized into a real
 *  (new) `cards` row on finish, then deleted — so an un-engaged prompt never enters the review
 *  queue before the learner does the session (Constitution III). `back` may be empty at plan time
 *  and is filled while doing. */
export const SessionCardDraftSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  front: z.string(),
  back: z.string(),
  order_index: z.number().int(),
});

export type SessionCardDraft = z.infer<typeof SessionCardDraftSchema>;
