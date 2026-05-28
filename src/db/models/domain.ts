import { z } from "zod";

/** A top-level subject area (Math, CS Theory…). User-defined. The scope anchor for per-vault
 *  data (Feature 009): every Campaign/Course/Milestone inherits its vault transitively via Domain.
 *  `vault_id` is nullable so a freshly-migrated, not-yet-adopted row still parses; in practice
 *  every row a scoped read returns has a non-null `vault_id`. */
export const DomainSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  vault_id: z.string().nullable(),
});

export type Domain = z.infer<typeof DomainSchema>;
