import { z } from "zod";
import type { SqlExecutor } from "../executor";
import { milestoneStatus, type MilestoneStatus } from "../models/enums";
import { selectParsed } from "./query";

/**
 * Read-only dashboard read-model (Feature 008 / F8). Computes the Command Center summary from the
 * existing Domain → Course → Milestone hierarchy with a constant, small number of aggregate
 * queries — never one-per-course (no N+1). Pure read: issues no writes and never touches `.md`.
 * Lives in the repository layer so features depend on `getDashboardSummary`, not on SQL or the
 * SQL plugin (Constitution IV). No new schema.
 */

export interface DashboardTotals {
  domains: number;
  courses: number;
  milestones: number;
}

export interface MilestoneProgress {
  todo: number;
  inProgress: number;
  done: number;
  /** todo + inProgress + done (equals `totals.milestones`). */
  total: number;
  /** 0..100 integer. 0 when `total === 0` — callers render "no milestones yet", never `NaN%`. */
  percentDone: number;
}

export interface DomainAllocation {
  id: string;
  name: string;
  color: string;
  courseCount: number;
  milestoneCount: number;
}

/** An active (open/in-progress) Project surfaced on the dashboard (Feature 015). Flat with its
 *  Domain id so the view can group by Domain; carries `courseId` to link into the Course detail. */
export interface ActiveProjectTile {
  id: string;
  title: string;
  courseId: string;
  domainId: string;
}

export interface DashboardSummary {
  totals: DashboardTotals;
  milestoneProgress: MilestoneProgress;
  /** One row per Domain, ordered by name. Domains with zero Courses are included. */
  allocation: DomainAllocation[];
  /** Active Projects in the active vault (Feature 015), newest first. Empty when there are none —
   *  the view renders nothing fabricated (Constitution III). */
  activeProjects: ActiveProjectTile[];
}

const TotalsRow = z.object({
  domains: z.number().int().nonnegative(),
  courses: z.number().int().nonnegative(),
  milestones: z.number().int().nonnegative(),
});

const StatusCountRow = z.object({
  status: milestoneStatus,
  n: z.number().int().nonnegative(),
});

const AllocationRow = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  course_count: z.number().int().nonnegative(),
  milestone_count: z.number().int().nonnegative(),
});

const ActiveProjectRow = z.object({
  id: z.string(),
  title: z.string(),
  course_id: z.string(),
  domain_id: z.string(),
});

/** Aggregate the dashboard summary for the active vault (Feature 009 — scoped to the vault's
 *  Domains). ~3 queries regardless of how many Courses exist. */
export async function getDashboardSummary(
  db: SqlExecutor,
  vaultId: string,
): Promise<DashboardSummary> {
  const [totals] = await selectParsed(
    db,
    TotalsRow,
    `SELECT (SELECT COUNT(*) FROM domains WHERE vault_id = ?) AS domains,
            (SELECT COUNT(*) FROM courses c
               JOIN domains d ON d.id = c.domain_id WHERE d.vault_id = ?) AS courses,
            (SELECT COUNT(*) FROM milestones m
               JOIN courses c ON c.id = m.course_id
               JOIN domains d ON d.id = c.domain_id WHERE d.vault_id = ?) AS milestones`,
    [vaultId, vaultId, vaultId],
  );

  const statusRows = await selectParsed(
    db,
    StatusCountRow,
    `SELECT m.status AS status, COUNT(*) AS n
     FROM milestones m
     JOIN courses c ON c.id = m.course_id
     JOIN domains d ON d.id = c.domain_id
     WHERE d.vault_id = ?
     GROUP BY m.status`,
    [vaultId],
  );
  const countFor = (s: MilestoneStatus) => statusRows.find((r) => r.status === s)?.n ?? 0;
  const todo = countFor("todo");
  const inProgress = countFor("in-progress");
  const done = countFor("done");
  const total = todo + inProgress + done;
  const milestoneProgress: MilestoneProgress = {
    todo,
    inProgress,
    done,
    total,
    percentDone: total === 0 ? 0 : Math.round((done / total) * 100),
  };

  const allocationRows = await selectParsed(
    db,
    AllocationRow,
    `SELECT d.id, d.name, d.color,
            COUNT(DISTINCT c.id) AS course_count,
            COUNT(m.id)          AS milestone_count
     FROM domains d
     LEFT JOIN courses c    ON c.domain_id = d.id
     LEFT JOIN milestones m ON m.course_id = c.id
     WHERE d.vault_id = ?
     GROUP BY d.id, d.name, d.color
     ORDER BY d.name`,
    [vaultId],
  );
  const allocation: DomainAllocation[] = allocationRows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    courseCount: r.course_count,
    milestoneCount: r.milestone_count,
  }));

  const activeProjectRows = await selectParsed(
    db,
    ActiveProjectRow,
    `SELECT p.id, p.title, p.course_id AS course_id, c.domain_id AS domain_id
     FROM projects p
     JOIN courses c ON c.id = p.course_id
     JOIN domains d ON d.id = c.domain_id
     WHERE d.vault_id = ? AND p.status IN ('open', 'in-progress')
     ORDER BY p.opened_at DESC, p.id`,
    [vaultId],
  );
  const activeProjects: ActiveProjectTile[] = activeProjectRows.map((r) => ({
    id: r.id,
    title: r.title,
    courseId: r.course_id,
    domainId: r.domain_id,
  }));

  return { totals, milestoneProgress, allocation, activeProjects };
}
