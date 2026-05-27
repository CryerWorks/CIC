import { z } from "zod";
import { resourceRole, assignmentKind } from "./enums";

/**
 * The M:N join entities. Each cascades from BOTH parents (deleting either end removes the
 * link row, never the shared entity on the other end — see the cascade matrix).
 */

/** course ↔ resource (with the resource's role for that course). PK (course_id, resource_id). */
export const CourseResourceSchema = z.object({
  course_id: z.string(),
  resource_id: z.string(),
  role: resourceRole,
});
export type CourseResource = z.infer<typeof CourseResourceSchema>;

/** What to study in a session (a resource + optional locator + how to engage it). */
export const SessionAssignmentSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  resource_id: z.string(),
  locator: z.string().nullable(),
  assignment_kind: assignmentKind,
});
export type SessionAssignment = z.infer<typeof SessionAssignmentSchema>;

/** card ↔ resource citation (with optional locator). PK (card_id, resource_id). */
export const CardResourceSchema = z.object({
  card_id: z.string(),
  resource_id: z.string(),
  locator: z.string().nullable(),
});
export type CardResource = z.infer<typeof CardResourceSchema>;

/** project ↔ milestone (which capabilities the project applies). PK (project_id, milestone_id). */
export const ProjectMilestoneSchema = z.object({
  project_id: z.string(),
  milestone_id: z.string(),
});
export type ProjectMilestone = z.infer<typeof ProjectMilestoneSchema>;

/** project ↔ resource (optional, with locator). PK (project_id, resource_id). */
export const ProjectResourceSchema = z.object({
  project_id: z.string(),
  resource_id: z.string(),
  locator: z.string().nullable(),
});
export type ProjectResource = z.infer<typeof ProjectResourceSchema>;
