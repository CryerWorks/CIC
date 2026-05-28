/**
 * Read-back: scan the vault, reconcile CIC Course MOCs into SQLite (contracts/course-sync.md,
 * research R7). Discriminates by the `cic-type: course` frontmatter, parses the managed sections,
 * resolves/creates the named Domain + Campaign, upserts the Course by `cic-id` (importing unknown
 * ones, FR-017), and makes its Milestones match the file. Non-CIC files are ignored; a CIC MOC
 * with a broken body is skipped with a note (FR-019). Read-only on the vault — never writes,
 * never deletes a file. Safe to run repeatedly (idempotent).
 */

import {
  findOrCreateDomainByName,
  findOrCreateCampaignByTitle,
  getCourse,
  upsertCourseRow,
  syncCourseMilestones,
} from "../../../db";
import { MocCourseFrontmatterSchema, parseMocBody, MocParseError } from "../moc";
import type { CourseSyncDeps } from "./materialize";

export type RescanOutcome = "imported" | "updated" | "skipped";

export interface RescanFileResult {
  path: string;
  outcome: RescanOutcome;
  note?: string;
}

export interface RescanReport {
  results: RescanFileResult[];
  imported: number;
  updated: number;
  skipped: number;
}

async function reconcileFile(deps: CourseSyncDeps, path: string): Promise<RescanFileResult | null> {
  const { vault, db } = deps;

  const read = await vault.reader.readNoteAs(path, MocCourseFrontmatterSchema);
  if (!read.ok) return null; // not a CIC Course MOC (or unreadable frontmatter) → ignore silently

  const parsed = parseMocBody(read.note.body);
  if (parsed instanceof MocParseError) {
    return { path, outcome: "skipped", note: parsed.detail };
  }

  const front = read.note.frontmatter;
  const courseId = front["cic-id"];

  const domain = await findOrCreateDomainByName(db, front.domain);
  const campaign = front.campaign
    ? await findOrCreateCampaignByTitle(db, domain.id, front.campaign)
    : null;

  const existing = await getCourse(db, courseId);
  await upsertCourseRow(db, {
    id: courseId,
    title: front.title,
    domainId: domain.id,
    campaignId: campaign?.id ?? null,
    mocPath: path,
  });

  const desired = parsed.milestones.map((m) => ({
    id: m.id ?? crypto.randomUUID(), // mint an id for a hand-added (comment-less) line
    capability: m.capability,
    status: m.status,
  }));
  await syncCourseMilestones(db, courseId, desired);

  return { path, outcome: existing ? "updated" : "imported" };
}

export async function rescanCourses(deps: CourseSyncDeps): Promise<RescanReport> {
  const results: RescanFileResult[] = [];
  for (const path of await deps.vault.reader.list()) {
    const result = await reconcileFile(deps, path);
    if (result) results.push(result);
  }
  return {
    results,
    imported: results.filter((r) => r.outcome === "imported").length,
    updated: results.filter((r) => r.outcome === "updated").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
  };
}
