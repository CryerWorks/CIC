/**
 * Read-back: scan the vault, reconcile CIC Project files into SQLite (contracts/project-sync.md,
 * research R8). Discriminates by `cic-type: project` frontmatter, resolves the Course by the file's
 * **`course-id`** (the stable link — never the human title, M2), and upserts the Project by `cic-id`
 * (importing unknown ones, reflecting external edits). A file whose `course-id` matches no Course in
 * this vault is skipped; malformed frontmatter is skipped with a note; non-Project files are ignored.
 * Read-only on the vault. Idempotent.
 */

import { upsertImportedProject } from "../../../db";
import { ProjectFrontmatterSchema } from "../doc";
import type { ProjectSyncDeps } from "./deps";

export type RescanProjectOutcome = "imported" | "updated" | "skipped";

export interface RescanProjectFileResult {
  path: string;
  outcome: RescanProjectOutcome;
  note?: string;
}

export interface RescanProjectsReport {
  results: RescanProjectFileResult[];
  imported: number;
  updated: number;
  skipped: number;
}

async function reconcileFile(
  deps: ProjectSyncDeps,
  path: string,
  vaultId: string,
): Promise<RescanProjectFileResult | null> {
  const { vault, db } = deps;

  const read = await vault.reader.readNoteAs(path, ProjectFrontmatterSchema);
  if (!read.ok) return null; // not a CIC Project (or unreadable frontmatter) → ignore silently

  const front = read.note.frontmatter;
  const courseId = front["course-id"];

  // Resolve the Course by its stable id AND confirm it lives in the active vault (scope guard, M2).
  const courseInVault = (
    await db.select<{ id: string }>(
      `SELECT c.id FROM courses c JOIN domains d ON d.id = c.domain_id WHERE c.id = ? AND d.vault_id = ?`,
      [courseId, vaultId],
    )
  )[0];
  if (!courseInVault) {
    return { path, outcome: "skipped", note: `Unknown course-id ${courseId} in this vault` };
  }

  const wasKnown = (await db.select<{ id: string }>("SELECT id FROM projects WHERE id = ?", [front["cic-id"]]))[0];

  await upsertImportedProject(db, {
    id: front["cic-id"],
    courseId,
    title: front.title,
    capability: front.capability,
    status: front.status,
    milestoneIds: front.milestones,
    openedAt: front.opened,
    closedAt: front.closed ?? null,
    template: front.template ?? null,
    projectPath: path,
  });

  return { path, outcome: wasKnown ? "updated" : "imported" };
}

export async function rescanProjects(
  deps: ProjectSyncDeps,
  vaultId: string,
): Promise<RescanProjectsReport> {
  const results: RescanProjectFileResult[] = [];
  for (const path of await deps.vault.reader.list()) {
    const result = await reconcileFile(deps, path, vaultId);
    if (result) results.push(result);
  }
  return {
    results,
    imported: results.filter((r) => r.outcome === "imported").length,
    updated: results.filter((r) => r.outcome === "updated").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
  };
}
