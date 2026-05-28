/**
 * The render/merge/parse input + output shapes for the pure MOC module. Decoupled from the
 * SQLite row types so the document logic never depends on the db layer at runtime (the only
 * db touch is the `MilestoneStatus` *type* + its enum, the single source of truth for status).
 */

import type { MilestoneStatus } from "../../../db/models/enums";

export interface MocMilestoneModel {
  id: string;
  capability: string;
  status: MilestoneStatus;
}

/** Everything the document functions need to render/merge a Course MOC. */
export interface MocModel {
  /** == course.id == frontmatter `cic-id`. */
  id: string;
  title: string;
  /** Domain name (human-facing). */
  domain: string;
  /** Campaign title, or null. */
  campaign: string | null;
  /** The one-paragraph capability statement (may be ""). */
  capability: string;
  /** Already in display order. */
  milestones: MocMilestoneModel[];
}

/** What `parseMocBody` extracts from the app-managed sections. Milestone ids may be `null`
 *  (a user-added line with no identity comment); the read-back caller mints ids for those. */
export interface ParsedMoc {
  capability: string;
  milestones: ParsedMilestoneLine[];
}

/** One parsed milestone line. `id === null` → the line had no (valid) identity comment, i.e. a
 *  user added it by hand in Obsidian; the caller mints an id on import. */
export interface ParsedMilestoneLine {
  id: string | null;
  capability: string;
  status: MilestoneStatus;
}

/** Raised when a body *looks* like a CIC MOC but is structurally unreadable (e.g. an opened
 *  marker with no matching close). A simply-empty section is NOT an error. */
export class MocParseError extends Error {
  constructor(readonly detail: string) {
    super(`Malformed MOC: ${detail}`);
    this.name = "MocParseError";
  }
}
