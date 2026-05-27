import { z } from "zod";

/** A top-level subject area (Math, CS Theory…). User-defined. */
export const DomainSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

export type Domain = z.infer<typeof DomainSchema>;
