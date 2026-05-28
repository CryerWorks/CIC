import { useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  getDashboardSummary,
  listCourses,
  type DashboardSummary,
  type DomainAllocation,
  type Course,
} from "../../db";

/**
 * Dashboard screen state (Feature 008 / F8, vault-scoped per 009). Loads the read-only aggregate
 * summary + the Course list **for the active vault**, and buckets Courses into their Domain (using
 * `summary.allocation`) for the at-a-glance list. Read-only — no mutators. Keyed on the active
 * vault id, so switching vaults re-scopes every tile (FR-007); with no vault it stays empty (the
 * route shows connect-a-vault guidance instead — FR-006).
 */

export interface DashboardCourseGroup {
  domain: DomainAllocation;
  courses: Course[];
}

export interface DashboardData {
  loading: boolean;
  summary: DashboardSummary | null;
  courseGroups: DashboardCourseGroup[];
}

export function useDashboard(): DashboardData {
  const db = useDb();
  const vaultId = useActiveVaultId();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [courseGroups, setCourseGroups] = useState<DashboardCourseGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vaultId) {
      // No active vault → nothing to scope to; the route shows connect-a-vault guidance.
      setSummary(null);
      setCourseGroups([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([getDashboardSummary(db, vaultId), listCourses(db, vaultId)])
      .then(([s, courses]) => {
        if (!active) return;
        setSummary(s);
        setCourseGroups(
          s.allocation.map((domain) => ({
            domain,
            courses: courses.filter((c) => c.domain_id === domain.id),
          })),
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [db, vaultId]);

  return { loading, summary, courseGroups };
}
