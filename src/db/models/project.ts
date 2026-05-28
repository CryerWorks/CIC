import { z } from "zod";
import { projectStatus } from "./enums";

/** Applied-practice artifact for a Course (PRD §F11). `project_path` links to the vault note. */
export const ProjectSchema = z.object({
  id: z.string(),
  course_id: z.string(),
  capability: z.string(),
  status: projectStatus,
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  project_path: z.string().nullable(),
  template: z.string().nullable(),
});

export type Project = z.infer<typeof ProjectSchema>;
