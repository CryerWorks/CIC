import { z } from "zod";
import { milestoneStatus } from "./enums";

/** A capability gate within a Course ("be able to derive X"). `order_index` (the column is
 *  `order_index` because `order` is reserved SQL) sets position within the course. */
export const MilestoneSchema = z.object({
  id: z.string(),
  course_id: z.string(),
  capability: z.string(),
  status: milestoneStatus,
  order_index: z.number().int(),
});

export type Milestone = z.infer<typeof MilestoneSchema>;
