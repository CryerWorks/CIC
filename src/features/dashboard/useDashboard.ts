import { useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import {
  getDashboardSummary,
  listCourses,
  type DashboardSummary,
  type DomainAllocation,
  type Course,
} from "../../db";

/**
 * Dashboard screen state (Feature 008 / F8). Loads the read-only aggregate summary + the Course
 * list, and buckets Courses into their Domain (using `summary.allocation`) for the at-a-glance
 * list. Read-only — no mutators. Re-reads on mount so the screen reflects current data each open
 * (FR-009). Does not require a vault (the data is vault-independent).
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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [courseGroups, setCourseGroups] = useState<DashboardCourseGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getDashboardSummary(db), listCourses(db)])
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
  }, [db]);

  return { loading, summary, courseGroups };
}
