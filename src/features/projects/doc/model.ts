/**
 * Pure data shapes for the Project document module (mirrors `courses/moc/model.ts`). No I/O, no
 * React, no db runtime — only the `ProjectStatus` enum type. `ProjectDocModel` is what the sync
 * layer hands to render/merge; `ParsedProject` + `ProjectParseError` are what parse hands back.
 */

import type { ProjectStatus } from "../../../db";
import type { ProjectFrontmatter } from "./frontmatter";

export interface ProjectDocModel {
  /** project.id → `cic-id`. */
  id: string;
  /** course.id → `course-id` (the STABLE link rescan resolves by — research R2/M2). */
  courseId: string;
  title: string;
  /** Human-readable course label for the reader (display only — never used to resolve the link). */
  courseTitle: string;
  capability: string;
  status: ProjectStatus;
  /** 1..N at create/save; 0..N at read time (a Milestone deletion can leave zero — M3). */
  milestoneIds: string[];
  /** `YYYY-MM-DD`. */
  openedDate: string;
  closedDate: string | null;
  /** Chosen seed template name, reference only. */
  template: string | null;
}

export interface ParsedProject {
  frontmatter: ProjectFrontmatter;
  /** The learner-owned body, surfaced untouched. */
  body: string;
}

/** A Project file whose frontmatter fails the schema (mirrors `MocParseError`). */
export class ProjectParseError extends Error {
  constructor(public readonly detail: string) {
    super(detail);
    this.name = "ProjectParseError";
  }
}
