import { useCallback, useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  listPlannedSessionsByCourse,
  listResources,
  listMilestonesByCourse,
  planSession,
  deletePlannedSession,
  type Session,
  type Resource,
  type Milestone,
  type AssignmentKind,
} from "../../db";

export interface PlanFormInput {
  objective: string;
  assignments: { resourceId: string; locator: string | null; kind: AssignmentKind }[];
  pretestQuestions: string[];
  cardDrafts: { front: string; back: string }[];
}

/**
 * Plan-a-session management for the Course-detail screen (Feature 012, US1). Loads the Course's
 * planned sessions, plus the active-vault Resources and the Course's Milestones (to author
 * assignments and seed the objective), and exposes `plan` / `removePlan`. Establishing a session
 * writes only to SQLite — no vault note, no review card (those happen when the session is *done*).
 */
export function useCoursePlans(courseId: string) {
  const db = useDb();
  const vaultId = useActiveVaultId() ?? "";
  const [planned, setPlanned] = useState<Session[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, rs, ms] = await Promise.all([
      listPlannedSessionsByCourse(db, courseId),
      listResources(db, vaultId),
      listMilestonesByCourse(db, courseId),
    ]);
    setPlanned(p);
    setResources(rs);
    setMilestones(ms);
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

  return { loading, planned, resources, milestones, plan, removePlan };
}
