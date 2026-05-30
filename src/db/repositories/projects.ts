import type { SqlExecutor } from "../executor";
import { ProjectSchema, type Project } from "../models/project";
import { insert, selectParsed, update } from "./query";
import { createCard } from "./cards";
import { addCardResource } from "./cardResources";

/**
 * Projects repository (Feature 015, PRD F11) — the applied-practice artifact. A Project belongs to
 * exactly one Course and exercises 1..N of its Milestones (`project_milestones`), optionally citing
 * Resources (`project_resources`). Projects are vault-scoped transitively via `project → course →
 * domain.vault_id` (research R7) — no `vault_id` column.
 *
 * The ≥1-milestone rule is a **create/save-time** invariant only: `project_milestones.milestone_id`
 * is `ON DELETE CASCADE`, so deleting a Milestone can leave a Project with zero links — reads MUST
 * return such a Project normally (M3/FR-020). Nothing here ever sets `status='complete'` without an
 * explicit learner-initiated `closeProject({ outcome: "complete" })` (Constitution III).
 */

export interface ProjectResourceRef {
  resource_id: string;
  locator: string | null;
}

export interface CreateProjectInput {
  courseId: string;
  title: string;
  capability: string;
  milestoneIds: string[];
  template?: string | null;
  resources?: ProjectResourceRef[];
  projectPath?: string | null;
}

function assertCreatable(input: { title: string; capability: string; milestoneIds: string[] }): void {
  if (!input.title.trim()) throw new Error("A project title is required.");
  if (!input.capability.trim()) throw new Error("A capability statement is required.");
  if (input.milestoneIds.length === 0) throw new Error("Link at least one Milestone.");
}

export async function createProject(db: SqlExecutor, input: CreateProjectInput): Promise<Project> {
  assertCreatable(input);
  const id = crypto.randomUUID();
  const openedAt = new Date().toISOString();
  const row: Project = {
    id,
    course_id: input.courseId,
    title: input.title.trim(),
    capability: input.capability.trim(),
    status: "open",
    opened_at: openedAt,
    closed_at: null,
    project_path: input.projectPath ?? null,
    template: input.template ?? null,
  };

  await db.transaction(async (tx) => {
    await insert(tx, "projects", row);
    for (const milestoneId of input.milestoneIds) {
      await insert(tx, "project_milestones", { project_id: id, milestone_id: milestoneId });
    }
    for (const ref of input.resources ?? []) {
      await insert(tx, "project_resources", {
        project_id: id,
        resource_id: ref.resource_id,
        locator: ref.locator ?? null,
      });
    }
  });

  return ProjectSchema.parse(row);
}

export async function getProject(db: SqlExecutor, id: string): Promise<Project | null> {
  const rows = await selectParsed(db, ProjectSchema, "SELECT * FROM projects WHERE id = ?", [id]);
  return rows[0] ?? null;
}

const ACTIVE_ORDER = `CASE status WHEN 'open' THEN 0 WHEN 'in-progress' THEN 1 ELSE 2 END, opened_at DESC, id`;

/** A Course's Projects (the Course-detail section): active first, then by opened date. */
export function listCourseProjects(db: SqlExecutor, courseId: string): Promise<Project[]> {
  return selectParsed(
    db,
    ProjectSchema,
    `SELECT * FROM projects WHERE course_id = ? ORDER BY ${ACTIVE_ORDER}`,
    [courseId],
  );
}

/** Active (`open`/`in-progress`) Projects in the active vault — for the dashboard. Vault-scoped
 *  transitively via `project → course → domain`. */
export function listActiveProjects(db: SqlExecutor, vaultId: string): Promise<Project[]> {
  return selectParsed(
    db,
    ProjectSchema,
    `SELECT p.* FROM projects p
     JOIN courses c ON c.id = p.course_id
     JOIN domains d ON d.id = c.domain_id
     WHERE d.vault_id = ? AND p.status IN ('open', 'in-progress')
     ORDER BY p.opened_at DESC, p.id`,
    [vaultId],
  );
}

export async function getProjectMilestoneIds(db: SqlExecutor, id: string): Promise<string[]> {
  const rows = await db.select<{ milestone_id: string }>(
    "SELECT milestone_id FROM project_milestones WHERE project_id = ?",
    [id],
  );
  return rows.map((r) => r.milestone_id);
}

export async function listProjectResources(db: SqlExecutor, id: string): Promise<ProjectResourceRef[]> {
  return db.select<ProjectResourceRef>(
    "SELECT resource_id, locator FROM project_resources WHERE project_id = ?",
    [id],
  );
}

/** Replace a Project's Milestone set (≥1; same-Course enforced in-app — the FK only guarantees a
 *  valid id, mirroring `sessions.milestone_id` in 013). */
export async function setProjectMilestones(
  db: SqlExecutor,
  id: string,
  milestoneIds: string[],
): Promise<void> {
  if (milestoneIds.length === 0) throw new Error("A project must keep at least one Milestone.");
  await db.transaction(async (tx) => {
    await tx.execute("DELETE FROM project_milestones WHERE project_id = ?", [id]);
    for (const milestoneId of milestoneIds) {
      await insert(tx, "project_milestones", { project_id: id, milestone_id: milestoneId });
    }
  });
}

export async function setProjectResources(
  db: SqlExecutor,
  id: string,
  refs: ProjectResourceRef[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute("DELETE FROM project_resources WHERE project_id = ?", [id]);
    for (const ref of refs) {
      await insert(tx, "project_resources", {
        project_id: id,
        resource_id: ref.resource_id,
        locator: ref.locator ?? null,
      });
    }
  });
}

export async function setProjectTitleCapability(
  db: SqlExecutor,
  id: string,
  input: { title: string; capability: string; template?: string | null },
): Promise<void> {
  if (!input.title.trim()) throw new Error("A project title is required.");
  if (!input.capability.trim()) throw new Error("A capability statement is required.");
  const set: Record<string, unknown> = { title: input.title.trim(), capability: input.capability.trim() };
  if (input.template !== undefined) set.template = input.template;
  await update(db, "projects", set, { id });
}

/** Persist the vault path after the sync layer materializes the file. */
export async function setProjectPath(db: SqlExecutor, id: string, projectPath: string): Promise<void> {
  await update(db, "projects", { project_path: projectPath }, { id });
}

/** All non-null Project paths — for slug-collision avoidance when minting a new file (mirrors
 *  `listCourseMocPaths`). Unscoped across vaults is fine: a free vault-relative path is what matters. */
export async function listProjectPaths(db: SqlExecutor): Promise<string[]> {
  const rows = await db.select<{ project_path: string | null }>(
    "SELECT project_path FROM projects WHERE project_path IS NOT NULL",
  );
  return rows.map((r) => r.project_path).filter((p): p is string => p !== null);
}

/** Idempotent `open → in-progress` (the "touched" transition, FR-009). Never auto-completes; a
 *  closed/in-progress Project is untouched. */
export async function markProjectInProgress(db: SqlExecutor, id: string): Promise<void> {
  await db.execute("UPDATE projects SET status = 'in-progress' WHERE id = ? AND status = 'open'", [id]);
}

export interface CloseProjectInput {
  projectId: string;
  outcome: "complete" | "abandoned";
  /** Learner-authored, manual-approved card rows (may be empty → spawns none). */
  cards?: { front: string; back: string }[];
  /** Optional Resource citations for every spawned card. */
  citeResourceIds?: string[];
}

/**
 * Close a Project (learner-initiated, FR-011/FR-012). Sets status + `closed_at` and spawns the
 * learner-authored cards via `createCard` (so each is a normal new card tagged with `project_id`) —
 * **never** auto-generates a card; an empty `cards` array spawns none. The reflection PROSE is
 * appended to the vault file by the sync layer, not here. One transaction.
 */
export async function closeProject(
  db: SqlExecutor,
  input: CloseProjectInput,
): Promise<{ project: Project; spawnedCardIds: string[] }> {
  const existing = await getProject(db, input.projectId);
  if (!existing) throw new Error(`Project ${input.projectId} not found`);
  const closedAt = new Date().toISOString();
  const spawnedCardIds: string[] = [];

  await db.transaction(async (tx) => {
    await update(
      tx,
      "projects",
      { status: input.outcome, closed_at: closedAt },
      { id: input.projectId },
    );
    for (const card of input.cards ?? []) {
      const created = await createCard(tx, {
        courseId: existing.course_id,
        front: card.front,
        back: card.back,
        projectId: input.projectId,
      });
      spawnedCardIds.push(created.id);
      for (const resourceId of input.citeResourceIds ?? []) {
        await addCardResource(tx, { cardId: created.id, resourceId, locator: null });
      }
    }
  });

  const project = ProjectSchema.parse({ ...existing, status: input.outcome, closed_at: closedAt });
  return { project, spawnedCardIds };
}

export interface ImportedProjectInput {
  id: string;
  courseId: string;
  title: string;
  capability: string;
  status: Project["status"];
  milestoneIds: string[];
  openedAt: string;
  closedAt: string | null;
  template: string | null;
  projectPath: string;
}

/** Rescan upsert by `cic-id` (FR-014): insert or update the row + reconcile its Milestone links to
 *  the file's list, dropping ids that no longer exist in this DB (the file is canonical; a referenced
 *  Milestone that was deleted is simply not re-linked → a Project may import with 0 links, M3). */
export async function upsertImportedProject(db: SqlExecutor, input: ImportedProjectInput): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.select<{ id: string }>("SELECT id FROM projects WHERE id = ?", [input.id]);
    const row = {
      id: input.id,
      course_id: input.courseId,
      title: input.title,
      capability: input.capability,
      status: input.status,
      opened_at: input.openedAt,
      closed_at: input.closedAt,
      project_path: input.projectPath,
      template: input.template,
    };
    if (existing[0]) {
      await update(
        tx,
        "projects",
        {
          course_id: row.course_id,
          title: row.title,
          capability: row.capability,
          status: row.status,
          opened_at: row.opened_at,
          closed_at: row.closed_at,
          project_path: row.project_path,
          template: row.template,
        },
        { id: input.id },
      );
    } else {
      await insert(tx, "projects", row);
    }

    // Reconcile milestone links to those that actually exist for this Course.
    await tx.execute("DELETE FROM project_milestones WHERE project_id = ?", [input.id]);
    for (const milestoneId of input.milestoneIds) {
      const ok = await tx.select<{ id: string }>(
        "SELECT id FROM milestones WHERE id = ? AND course_id = ?",
        [milestoneId, input.courseId],
      );
      if (ok[0]) {
        await insert(tx, "project_milestones", { project_id: input.id, milestone_id: milestoneId });
      }
    }
  });
}

/** Delete a Project. Cascade removes `project_milestones`/`project_resources`; `sessions.project_id`
 *  and `cards.project_id` reset to NULL via the FK (the work-block sessions + spawned cards survive,
 *  just unlinked). The vault file fate is handled separately by the sync delete layer. */
export async function deleteProject(db: SqlExecutor, id: string): Promise<void> {
  await db.execute("DELETE FROM projects WHERE id = ?", [id]);
}
