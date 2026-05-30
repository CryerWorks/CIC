import { useCallback, useEffect, useMemo, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  listCourseSessions,
  listResources,
  listMilestonesByCourse,
  listCourseProjects,
  planSession,
  deletePlannedSession,
  reorderCourseSessions,
  setSessionMilestone,
  type Session,
  type Resource,
  type Milestone,
  type Project,
  type AssignmentKind,
} from "../../db";

export interface PlanFormInput {
  objective: string;
  /** The Course Milestone this session advances (Feature 013, optional). */
  milestoneId?: string | null;
  /** The Project this session is a work block for (Feature 015, optional). */
  projectId?: string | null;
  assignments: { resourceId: string; locator: string | null; kind: AssignmentKind }[];
  pretestQuestions: string[];
  cardDrafts: { front: string; back: string }[];
}

export interface MilestoneCoverage {
  milestone: Milestone;
  count: number;
}

/**
 * Course curriculum management for the Course-detail screen (Feature 012 + 013). Loads the
 * Course's **whole** ordered session sequence (planned + completed) via `listCourseSessions`, plus
 * the active-vault Resources and the Course's Milestones, and derives **coverage** (sessions per
 * Milestone) and **progress** (done / total) — no stored counters (R4). Exposes `plan` /
 * `removePlan` / `reorder` / `setMilestone`, all of which refresh so the view, coverage, and
 * progress stay consistent. All mutations write only to SQLite — no vault note, no review card.
 */
export function useCoursePlans(courseId: string) {
  const db = useDb();
  const vaultId = useActiveVaultId() ?? "";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, rs, ms, ps] = await Promise.all([
      listCourseSessions(db, courseId),
      listResources(db, vaultId),
      listMilestonesByCourse(db, courseId),
      listCourseProjects(db, courseId),
    ]);
    setSessions(s);
    setResources(rs);
    setMilestones(ms);
    setProjects(ps);
  }, [db, courseId, vaultId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const plan = useCallback(
    async (input: PlanFormInput) => {
      await planSession(db, { courseId, ...input });
      await load();
    },
    [db, courseId, load],
  );

  const removePlan = useCallback(
    async (id: string) => {
      await deletePlannedSession(db, id);
      await load();
    },
    [db, load],
  );

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      await reorderCourseSessions(db, courseId, orderedIds);
      await load();
    },
    [db, courseId, load],
  );

  const setMilestone = useCallback(
    async (sessionId: string, milestoneId: string | null) => {
      await setSessionMilestone(db, sessionId, milestoneId);
      await load();
    },
    [db, load],
  );

  // Coverage (R4/FR-009): sessions counted per Milestone; a Milestone with 0 is uncovered. Sessions
  // with no Milestone fall into the unassigned bucket.
  const { coverage, unassignedCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const s of sessions) {
      if (s.milestone_id) counts.set(s.milestone_id, (counts.get(s.milestone_id) ?? 0) + 1);
      else unassigned += 1;
    }
    return {
      coverage: milestones.map((m): MilestoneCoverage => ({ milestone: m, count: counts.get(m.id) ?? 0 })),
      unassignedCount: unassigned,
    };
  }, [sessions, milestones]);

  // Progress (R4/FR-012): a literal done / total — never a mastery claim.
  const progress = useMemo(
    () => ({ done: sessions.filter((s) => s.status === "completed").length, total: sessions.length }),
    [sessions],
  );

  return {
    loading,
    sessions,
    resources,
    milestones,
    projects,
    coverage,
    unassignedCount,
    progress,
    plan,
    removePlan,
    reorder,
    setMilestone,
    refresh: load,
  };
}
