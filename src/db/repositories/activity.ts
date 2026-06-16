import type { SqlExecutor } from "../executor";
import { selectParsed } from "./query";
import { z } from "zod";

/**
 * Read-model queries for activity tiles on the Dashboard.
 * Pure read — no writes, no vault touch.
 */

// ── Streak ──────────────────────────────────────────────────────────────

const DayCountRow = z.object({ day: z.string(), n: z.number().int().nonnegative() });

/** How many consecutive past days (including today) had at least one review or
 *  completed session. Gaps break the chain; today counts if there's activity. */
export async function getCurrentStreak(db: SqlExecutor, vaultId: string): Promise<number> {
  const rows = await selectParsed(
    db,
    DayCountRow,
    `SELECT day, MAX(n) AS n FROM (
       SELECT date(reviewed_at) AS day, COUNT(*) AS n
       FROM reviews r
       JOIN cards c ON c.id = r.card_id
       JOIN courses co ON co.id = c.course_id
       JOIN domains d ON d.id = co.domain_id
       WHERE d.vault_id = ?
       GROUP BY date(reviewed_at)
       UNION ALL
       SELECT date(completed_at) AS day, COUNT(*) AS n
       FROM sessions s
       JOIN courses co ON co.id = s.course_id
       JOIN domains d ON d.id = co.domain_id
       WHERE d.vault_id = ? AND s.status = 'completed'
       GROUP BY date(completed_at)
     ) GROUP BY day ORDER BY day DESC`,
    [vaultId, vaultId],
  );

  if (rows.length === 0) return 0;

  // Count backwards from today
  const today = new Date().toISOString().slice(0, 10);
  const activeDays = new Set(rows.map((r) => r.day));

  // If nothing today, streak is broken — return 0
  // (but still count past streaks: find longest recent block)
  let streak = 0;
  const d = new Date(today + "T00:00:00Z");
  for (let i = 0; i < 365; i++) {
    const day = d.toISOString().slice(0, 10);
    if (activeDays.has(day)) {
      streak++;
    } else if (i === 0) {
      // Today has no activity — streak may be active from yesterday
      // Keep going to find where streak would be
      break;
    } else {
      break;
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

// ── Today's Protocol ────────────────────────────────────────────────────

const TodayCountsRow = z.object({
  planned: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});

export interface TodayProtocol {
  /** Sessions planned (status='planned') for the active vault */
  plannedCount: number;
  /** Sessions completed today */
  completedToday: number;
  /** Due card count (caller provides from existing dueCount) */
  dueCount: number;
}

/** What's the protocol state today? Sessions planned, completed, and due cards. */
export async function getTodayProtocol(db: SqlExecutor, vaultId: string): Promise<{ plannedCount: number; completedToday: number }> {
  const [counts] = await selectParsed(
    db,
    TodayCountsRow,
    `SELECT
       (SELECT COUNT(*) FROM sessions s
        JOIN courses co ON co.id = s.course_id
        JOIN domains d ON d.id = co.domain_id
        WHERE d.vault_id = ? AND s.status = 'planned') AS planned,
       (SELECT COUNT(*) FROM sessions s
        JOIN courses co ON co.id = s.course_id
        JOIN domains d ON d.id = co.domain_id
        WHERE d.vault_id = ? AND s.status = 'completed'
        AND date(s.completed_at) = date('now')) AS completed`,
    [vaultId, vaultId],
  );
  return { plannedCount: counts.planned, completedToday: counts.completed };
}

// ── Recent Sessions ─────────────────────────────────────────────────────

const SessionRow = z.object({
  id: z.string(),
  objective: z.string(),
  course_title: z.string(),
  completed_at: z.string(),
  domain_color: z.string(),
});

export interface RecentSession {
  id: string;
  objective: string;
  courseTitle: string;
  completedAt: string;
  domainColor: string;
}

/** Last 5 completed sessions for the active vault. */
export async function getRecentSessions(db: SqlExecutor, vaultId: string): Promise<RecentSession[]> {
  const rows = await selectParsed(
    db,
    SessionRow,
    `SELECT s.id, s.objective, co.title AS course_title,
            s.completed_at, d.color AS domain_color
     FROM sessions s
     JOIN courses co ON co.id = s.course_id
     JOIN domains d ON d.id = co.domain_id
     WHERE d.vault_id = ? AND s.status = 'completed'
     ORDER BY s.completed_at DESC
     LIMIT 5`,
    [vaultId],
  );
  return rows.map((r) => ({
    id: r.id,
    objective: r.objective,
    courseTitle: r.course_title,
    completedAt: r.completed_at,
    domainColor: r.domain_color,
  }));
}

// ── Activity Heatmap ────────────────────────────────────────────────────

const HeatmapRow = z.object({
  day: z.string(),
  count: z.number().int().nonnegative(),
});

export interface HeatmapDay {
  day: string;  // YYYY-MM-DD
  count: number;
  level: 0 | 1 | 2 | 3 | 4; // 0 = none, 4 = highest activity
}

/** 12-week activity heatmap from reviews + completed sessions. */
export async function getActivityHeatmap(db: SqlExecutor, vaultId: string): Promise<HeatmapDay[]> {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 84); // 12 weeks = 84 days

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const rows = await selectParsed(
    db,
    HeatmapRow,
    `SELECT day, SUM(n) AS count FROM (
       SELECT date(reviewed_at) AS day, COUNT(*) AS n
       FROM reviews r
       JOIN cards c ON c.id = r.card_id
       JOIN courses co ON co.id = c.course_id
       JOIN domains d ON d.id = co.domain_id
       WHERE d.vault_id = ? AND date(reviewed_at) BETWEEN ? AND ?
       GROUP BY date(reviewed_at)
       UNION ALL
       SELECT date(completed_at) AS day, COUNT(*) AS n
       FROM sessions s
       JOIN courses co ON co.id = s.course_id
       JOIN domains d ON d.id = co.domain_id
       WHERE d.vault_id = ? AND s.status = 'completed'
       AND date(s.completed_at) BETWEEN ? AND ?
       GROUP BY date(completed_at)
     ) GROUP BY day ORDER BY day`,
    [vaultId, startStr, endStr, vaultId, startStr, endStr],
  );

  const countByDay = new Map(rows.map((r) => [r.day, r.count]));
  const max = Math.max(1, ...rows.map((r) => r.count));

  // Fill all 84 days, even with zero counts
  const days: HeatmapDay[] = [];
  const d = new Date(startStr + "T00:00:00Z");
  for (let i = 0; i < 84; i++) {
    const day = d.toISOString().slice(0, 10);
    const count = countByDay.get(day) ?? 0;
    const level = count === 0 ? 0
      : count <= max * 0.25 ? 1
      : count <= max * 0.5 ? 2
      : count <= max * 0.75 ? 3
      : 4 as HeatmapDay["level"];
    days.push({ day, count, level });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}
