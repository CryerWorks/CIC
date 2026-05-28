import { z } from "zod";
import { reviewRating } from "./enums";

/** One rating event on a card. `confidence` (F3.5 calibration) is nullable with NO default —
 *  an autofilled value would defeat the mechanism (Constitution III). */
export const ReviewSchema = z.object({
  id: z.string(),
  card_id: z.string(),
  rating: reviewRating,
  confidence: z.number().int().min(1).max(5).nullable(),
  reviewed_at: z.string(),
  elapsed_ms: z.number().int().nullable(),
});

export type Review = z.infer<typeof ReviewSchema>;
