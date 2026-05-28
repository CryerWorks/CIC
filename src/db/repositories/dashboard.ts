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

export interface DashboardSummary {
  totals: DashboardTotals;
  milestoneProgress: MilestoneProgress;
  /** One row per Domain, ordered by name. Domains with zero Courses are included. */
  allocation: DomainAllocation[];
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

/** Aggregate the dashboard summary. ~3 queries regardless of how many Courses exist. */
export async function getDashboardSummary(db: SqlExecutor): Promise<DashboardSummary> {
  const [totals] = await selectParsed(
    db,
    TotalsRow,
    `SELECT (SELECT COUNT(*) FROM domains)    AS domains,
            (SELECT COUNT(*) FROM courses)    AS courses,
            (SELECT COUNT(*) FROM milestones) AS milestones`,
  );

  const statusRows = await selectParsed(
    db,
    StatusCountRow,
    "SELECT status, COUNT(*) AS n FROM milestones GROUP BY status",
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
     GROUP BY d.id, d.name, d.color
     ORDER BY d.name`,
  );
  const allocation: DomainAllocation[] = allocationRows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    courseCount: r.course_count,
    milestoneCount: r.milestone_count,
  }));

  return { totals, milestoneProgress, allocation };
}
