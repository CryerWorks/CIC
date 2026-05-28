/**
 * The Course MOC frontmatter contract (research R6). `MocCourseFrontmatterSchema` doubles as
 * the discriminator: a vault `.md` whose frontmatter parses here (with `cic-type: course`) is
 * a CIC Course MOC; anything else is ignored by read-back. `cic-id` is the durable identity
 * link (== course.id), so a renamed/moved file still matches its Course.
 */

import { z } from "zod";

export const MocCourseFrontmatterSchema = z.object({
  "cic-type": z.literal("course"),
  "cic-id": z.string().min(1),
  title: z.string().min(1),
  domain: z.string().min(1),
  // Lenient on import: a hand-authored MOC may omit `campaign` entirely → treat as null.
  campaign: z.string().nullable().optional().default(null),
});

export type MocCourseFrontmatter = z.infer<typeof MocCourseFrontmatterSchema>;
