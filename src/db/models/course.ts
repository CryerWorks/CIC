import { z } from "zod";

/** The enrollable unit, backed by an Obsidian MOC file (`moc_path`, a vault link — never the
 *  MOC content itself). Optionally part of a Campaign. */
export const CourseSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain_id: z.string(),
  campaign_id: z.string().nullable(),
  moc_path: z.string().nullable(),
});

export type Course = z.infer<typeof CourseSchema>;
