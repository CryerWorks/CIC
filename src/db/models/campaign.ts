import { z } from "zod";

/** A long-arc objective spanning multiple Courses within a Domain. */
export const CampaignSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain_id: z.string(),
});

export type Campaign = z.infer<typeof CampaignSchema>;
