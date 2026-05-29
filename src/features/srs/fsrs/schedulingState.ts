import { z } from "zod";

/**
 * Persisted FSRS scheduling state — the `ts-fsrs` card with its `Date` fields serialized to
 * ISO strings. Stored as JSON in `cards.fsrs_state`. Validated on read so a malformed or
 * legacy blob is rejected cleanly (the repo then treats the card as new — FR-021), never a
 * thrown parse error. The shape mirrors `ts-fsrs` v5's `Card`; the library owns its meaning.
 */
export const SchedulingStateSchema = z.object({
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number().int().min(0).max(3),
  last_review: z.string().optional(),
});

export type SchedulingState = z.infer<typeof SchedulingStateSchema>;
