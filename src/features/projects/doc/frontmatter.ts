/**
 * The Project frontmatter contract (research R2/R8/M2). `ProjectFrontmatterSchema` doubles as the
 * rescan discriminator: a vault `.md` whose frontmatter parses here (with `cic-type: project`) is a
 * CIC Project; anything else is ignored. `cic-id` is the durable Project identity (== project.id);
 * `course-id` is the STABLE link to its Course (== course.id) — rescan resolves by it, never by the
 * human `course` title (which is display-only).
 */

import { z } from "zod";
import { projectStatus } from "../../../db";

/** YAML auto-parses an unquoted `2026-05-29` as a Date (e.g. a hand-authored file in Obsidian).
 *  Normalize it back to a `YYYY-MM-DD` string so date fields round-trip robustly either way. */
const toDateString = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
const dateString = z.preprocess(toDateString, z.string().min(1));
const optionalDateString = z.preprocess(toDateString, z.string()).nullable().optional().default(null);

export const ProjectFrontmatterSchema = z.object({
  "cic-type": z.literal("project"),
  "cic-id": z.string().min(1),
  "course-id": z.string().min(1),
  title: z.string().min(1),
  // Display-only label for the reader; lenient (a hand-authored file may omit it → "").
  course: z.string().optional().default(""),
  capability: z.string().min(1),
  status: projectStatus,
  // 1..N at authoring, but lenient on import: a malformed/missing list → [] (reconciled by rescan).
  milestones: z.array(z.string()).optional().default([]),
  opened: dateString,
  closed: optionalDateString,
  template: z.string().nullable().optional().default(null),
});

export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;
