import { useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  getDashboardSummary,
  listCourses,
  countDueCards,
  getNewCardCap,
  getOverconfidentCards,
  getOpenGapCountByCourse,
  type DashboardSummary,
  type DomainAllocation,
  type Course,
  type Card,
  type GapCountByCourse,
} from "../../db";

/**
 * Dashboard screen state (Feature 008 / F8, vault-scoped per 009). Loads the read-only aggregate
 * summary + the Course list **for the active vault**, and buckets Courses into their Domain (using
 * `summary.allocation`) for the at-a-glance list. Read-only — no mutators. Keyed on the active
 * vault id, so switching vaults re-scopes every tile (FR-007); with no vault it stays empty (the
 * route shows connect-a-vault guidance instead — FR-006).
 *
 * Phase 4 (Feature 018): also loads open Feynman gap counts for the "Gaps to Chase" tile.
 */

export interface DashboardCourseGroup {
  domain: DomainAllocation;
  courses: Course[];
}

export interface DashboardData {
  loading: boolean;
  summary: DashboardSummary | null;
  courseGroups: DashboardCourseGroup[];
  /** Cards due for review now, in the active vault (Feature 010). */
  dueCount: number;
  /** Cards whose latest review was high-confidence but failed (F3.5 calibration). */
  overconfident: Card[];
  /** Open Feynman gaps grouped by course (Feature 018). */
  gapCounts: GapCountByCourse[];
}

export function useDashboard(refreshKey = 0): DashboardData {
  const db = useDb();
  const vaultId = useActiveVaultId();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [courseGroups, setCourseGroups] = useState<DashboardCourseGroup[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [overconfident, setOverconfident] = useState<Card[]>([]);
  const [gapCounts, setGapCounts] = useState<GapCountByCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vaultId) {
      // No active vault → nothing to scope to; the route shows connect-a-vault guidance.
      setSummary(null);
      setCourseGroups([]);
      setDueCount(0);
      setOverconfident([]);
      setGapCounts([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      const cap = await getNewCardCap(db);
      const [s, courses, due, over, gaps] = await Promise.all([
        getDashboardSummary(db, vaultId),
        listCourses(db, vaultId),
        countDueCards(db, vaultId, new Date().toISOString(), cap),
        getOverconfidentCards(db, vaultId),
        getOpenGapCountByCourse(db, vaultId),
      ]);
      if (!active) return;
      setSummary(s);
      setCourseGroups(
        s.allocation.map((domain) => ({
          domain,
          courses: courses.filter((c) => c.domain_id === domain.id),
        })),
      );
      setDueCount(due);
      setOverconfident(over);
      setGapCounts(gaps);
    })().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [db, vaultId, refreshKey]);

  return { loading, summary, courseGroups, dueCount, overconfident, gapCounts };
}
