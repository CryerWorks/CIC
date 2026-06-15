import type { SqlExecutor } from "../../db/executor";
import { getSetting } from "../../db/repositories/settings";

/**
 * Interleaving Scheduler (Feature 021 / F6).
 *
 * Pure-logic, headless scheduler for the Daily Mix dashboard tile. Computes what to study
 * next by combining planned sessions, due reviews, and cold (neglected) domains — then
 * interleaves across domains so recommendations alternate instead of batching one subject.
 * Never suggests courses with unmet prerequisites.
 */

/** Settings key + default for the cold-domain threshold (days without activity). */
export const INTERLEAVING_COLD_DAYS_KEY = "interleaving.coldDays";
export const DEFAULT_COLD_DAYS = 7;

/** One recommendation in the daily mix. */
export interface DailyMixItem {
  courseId: string;
  courseTitle: string;
  domainId: string;
  domainName: string;
  /** Why this course was included. */
  reason: "planned" | "due-review" | "cold";
}

/** A domain the learner hasn't touched recently. */
export interface ColdDomain {
  id: string;
  name: string;
  color: string;
  daysSinceLastSession: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the configured cold threshold from settings, falling back to the default. */
export async function getColdThreshold(db: SqlExecutor): Promise<number> {
  const raw = await getSetting(db, INTERLEAVING_COLD_DAYS_KEY);
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULT_COLD_DAYS;
}

/**
 * Compute the daily mix for `vaultId`:
 * 1. Gather courses with planned sessions today (highest priority).
 * 2. Gather courses with due reviews (cards whose `due_at <= now`).
 * 3. Gather courses in cold domains (no completed session within the threshold window).
 * 4. Deduplicate (keep the highest-priority reason per course).
 * 5. Filter out courses whose prerequisites have zero completed sessions.
 * 6. Interleave across domains (round-robin).
 * 7. Return at most 5 items.
 *
 * No vault writes, no AI, no new npm dependencies. Pure SQL + derived logic.
 */
export async function getDailyMix(
  db: SqlExecutor,
  vaultId: string,
): Promise<DailyMixItem[]> {
  const now = new Date().toISOString();
  const todayPrefix = now.slice(0, 10);

  // 1. Courses with planned sessions today
  const plannedRows = await db.select<FlatRow>(
    `SELECT DISTINCT c.id AS course_id, c.title AS course_title,
            d.id AS domain_id, d.name AS domain_name
     FROM sessions s
     JOIN courses c ON c.id = s.course_id
     JOIN domains d ON d.id = c.domain_id
     WHERE d.vault_id = ? AND s.status = 'planned' AND substr(s.date, 1, 10) = ?
     ORDER BY c.title`,
    [vaultId, todayPrefix],
  );

  // 2. Courses with due review cards
  const dueRows = await db.select<FlatRow>(
    `SELECT DISTINCT c.id AS course_id, c.title AS course_title,
            d.id AS domain_id, d.name AS domain_name
     FROM cards cd
     JOIN courses c ON c.id = cd.course_id
     JOIN domains d ON d.id = c.domain_id
     WHERE d.vault_id = ? AND cd.fsrs_state IS NOT NULL AND cd.due_at <= ?
     ORDER BY c.title`,
    [vaultId, now],
  );

  // 3. Courses in cold domains (no completed session within threshold)
  const coldDays = await getColdThreshold(db);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - coldDays);
  const cutoffStr = cutoff.toISOString();

  const coldRows = await db.select<FlatRow>(
    `SELECT DISTINCT c.id AS course_id, c.title AS course_title,
            d.id AS domain_id, d.name AS domain_name
     FROM domains d
     JOIN courses c ON c.domain_id = d.id
     WHERE d.vault_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM sessions s
         WHERE s.course_id = c.id AND s.status = 'completed'
           AND s.completed_at >= ?
       )
     ORDER BY c.title`,
    [vaultId, cutoffStr],
  );

  // 4. Merge with priority deduplication
  const seen = new Set<string>();
  const merged: DailyMixItem[] = [];

  const push = (row: FlatRow, reason: DailyMixItem["reason"]) => {
    if (seen.has(row.course_id)) return;
    seen.add(row.course_id);
    merged.push({
      courseId: row.course_id,
      courseTitle: row.course_title,
      domainId: row.domain_id,
      domainName: row.domain_name,
      reason,
    });
  };

  for (const r of plannedRows) push(r, "planned");
  for (const r of dueRows) push(r, "due-review");
  for (const r of coldRows) push(r, "cold");

  // 5. Filter out courses with unmet prerequisites
  const filtered: DailyMixItem[] = [];
  for (const item of merged) {
    if (await respectsPrereqs(db, item.courseId)) {
      filtered.push(item);
    }
  }

  // 6. Interleave across domains, cap at 5
  return interleaveByDomain(filtered).slice(0, 5);
}

/**
 * True when every declared prerequisite of `courseId` has at least one completed
 * session. A course with zero declared prereqs always returns true.
 */
export async function respectsPrereqs(
  db: SqlExecutor,
  courseId: string,
): Promise<boolean> {
  const prereqs = await db.select<{ prereq_course_id: string }>(
    "SELECT prereq_course_id FROM course_dependencies WHERE course_id = ?",
    [courseId],
  );

  for (const p of prereqs) {
    const rows = await db.select<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sessions WHERE course_id = ? AND status = 'completed'",
      [p.prereq_course_id],
    );
    if ((rows[0]?.n ?? 0) === 0) return false;
  }

  return true;
}

/**
 * Domains with no completed session in the last N days (defaulting to the configured
 * cold threshold). Includes domains with zero sessions ever. Ordered by domain name.
 */
export async function getColdDomains(
  db: SqlExecutor,
  vaultId: string,
  days?: number,
): Promise<ColdDomain[]> {
  const coldDays = days ?? (await getColdThreshold(db));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - coldDays);
  const cutoffStr = cutoff.toISOString();

  const rows = await db.select<{
    id: string;
    name: string;
    color: string;
    last_session: string | null;
  }>(
    `SELECT d.id, d.name, d.color,
            (SELECT MAX(s.completed_at) FROM sessions s
             JOIN courses c ON c.id = s.course_id
             WHERE c.domain_id = d.id AND s.status = 'completed'
            ) AS last_session
     FROM domains d
     WHERE d.vault_id = ?
       AND (
         (SELECT MAX(s.completed_at) FROM sessions s
          JOIN courses c ON c.id = s.course_id
          WHERE c.domain_id = d.id AND s.status = 'completed'
         ) IS NULL
         OR
         (SELECT MAX(s.completed_at) FROM sessions s
          JOIN courses c ON c.id = s.course_id
          WHERE c.domain_id = d.id AND s.status = 'completed'
         ) < ?
       )
     ORDER BY d.name`,
    [vaultId, cutoffStr],
  );

  return rows.map((r) => {
    const lastTime = r.last_session ? new Date(r.last_session).getTime() : 0;
    const daysSince = lastTime === 0
      ? coldDays + 1 // never had a session → definitely cold
      : Math.floor((Date.now() - lastTime) / 86_400_000);
    return { id: r.id, name: r.name, color: r.color, daysSinceLastSession: daysSince };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface FlatRow {
  course_id: string;
  course_title: string;
  domain_id: string;
  domain_name: string;
}

/**
 * Round-robin interleave: take one item from each domain in turn so that no two
 * adjacent recommendations belong to the same domain. Falls back to a simple sort
 * when there is only one domain represented.
 */
function interleaveByDomain(items: DailyMixItem[]): DailyMixItem[] {
  if (items.length <= 1) return items;

  // Group by domain, preserving insertion order within each group.
  const byDomain = new Map<string, DailyMixItem[]>();
  for (const item of items) {
    const list = byDomain.get(item.domainId) ?? [];
    list.push(item);
    byDomain.set(item.domainId, list);
  }

  if (byDomain.size <= 1) return items; // single domain → nothing to interleave

  const domains = [...byDomain.entries()].map(([id, list]) => ({
    domainId: id,
    items: list,
    index: 0,
  }));

  const result: DailyMixItem[] = [];
  let remaining = items.length;

  while (remaining > 0) {
    let advanced = false;
    for (const d of domains) {
      if (d.index < d.items.length) {
        result.push(d.items[d.index]);
        d.index++;
        remaining--;
        advanced = true;
      }
    }
    if (!advanced) break;
  }

  return result;
}
