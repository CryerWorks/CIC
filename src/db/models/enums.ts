import { z } from "zod";

/**
 * Single source of truth for every enumerated field (research R6 — defense in depth).
 * The value arrays drive both the zod boundary schemas here AND the DDL `CHECK (... IN (...))`
 * lists in `migrations/m0001_initial.ts` (via `sqlEnum`), so the two can never drift.
 */

export const MILESTONE_STATUS = ["todo", "in-progress", "done"] as const;
export const PROJECT_STATUS = ["open", "in-progress", "complete", "abandoned"] as const;
export const RESOURCE_KIND = [
  "pdf",
  "epub",
  "markdown",
  "video_file",
  "video_url",
  "web_page",
  "book",
  "audio",
] as const;
export const RESOURCE_ROLE = ["primary", "secondary", "reference"] as const;
export const ASSIGNMENT_KIND = ["read", "watch", "listen", "review"] as const;
export const REVIEW_RATING = ["again", "hard", "good", "easy"] as const;

export const milestoneStatus = z.enum(MILESTONE_STATUS);
export const projectStatus = z.enum(PROJECT_STATUS);
export const resourceKind = z.enum(RESOURCE_KIND);
export const resourceRole = z.enum(RESOURCE_ROLE);
export const assignmentKind = z.enum(ASSIGNMENT_KIND);
export const reviewRating = z.enum(REVIEW_RATING);

export type MilestoneStatus = z.infer<typeof milestoneStatus>;
export type ProjectStatus = z.infer<typeof projectStatus>;
export type ResourceKind = z.infer<typeof resourceKind>;
export type ResourceRole = z.infer<typeof resourceRole>;
export type AssignmentKind = z.infer<typeof assignmentKind>;
export type ReviewRating = z.infer<typeof reviewRating>;

/** Render a value list as a SQL `IN (...)` body — `'a', 'b'` — for DDL CHECK constraints.
 *  Inputs are compile-time string literals from this file, never user data. */
export const sqlEnum = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(", ");
