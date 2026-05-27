import { z } from "zod";
import { jsonColumn } from "./_shared";

/** Per-day activity. `date` (`YYYY-MM-DD`) is the natural primary key. `domains_touched` is a
 *  JSON array of domain ids studied that day. */
export const StreakSchema = z.object({
  date: z.string(),
  minutes: z.number().int(),
  domains_touched: jsonColumn(z.array(z.string())),
});

export type Streak = z.infer<typeof StreakSchema>;
