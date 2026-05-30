import { z } from "zod";
import { projectStatus } from "./enums";

/** Applied-practice artifact for a Course (PRD §F11). `project_path` links to the vault note.
 *  `title` (Feature 015, m0008) is a short human label, distinct from the `capability` sentence. */
export const ProjectSchema = z.object({
  id: z.string(),
  course_id: z.string(),
  title: z.string(),
  capability: z.string(),
  status: projectStatus,
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  project_path: z.string().nullable(),
  template: z.string().nullable(),
});

export type Project = z.infer<typeof ProjectSchema>;
