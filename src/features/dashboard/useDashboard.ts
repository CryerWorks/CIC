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
  getCurrentStreak,
  getTodayProtocol,
  getRecentSessions,
  getActivityHeatmap,
  type DashboardSummary,
  type DomainAllocation,
  type Course,
  type Card,
  type GapCountByCourse,
  type RecentSession,
  type HeatmapDay,
} from "../../db";
import { getDailyMix, getColdDomains, type DailyMixItem, type ColdDomain } from "../interleaving/scheduler";
import { getLinkedNotes, type KnowledgeGraphData } from "./graphQueries";

/**
 * Dashboard screen state (Feature 008 / F8, vault-scoped per 009). Loads the read-only aggregate
 * summary + the Course list **for the active vault**, and buckets Courses into their Domain (using
 * `summary.allocation`) for the at-a-glance list. Read-only — no mutators. Keyed on the active
 * vault id, so switching vaults re-scopes every tile (FR-007); with no vault it stays empty (the
 * route shows connect-a-vault guidance instead — FR-006).
 *
 * Phase 4 (Feature 018): also loads open Feynman gap counts for the "Gaps to Chase" tile.
 * Phase 6 (Feature 021): loads interleaving scheduler data for Daily Mix + Going Cold tiles.
 * Phase 7 (Feature 022): loads knowledge graph data for the "Knowledge Graph" tile.
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
  /** Daily mix recommendations (Feature 021). */
  dailyMix: DailyMixItem[];
  /** Cold domains (Feature 021). */
  coldDomains: ColdDomain[];
  /** Knowledge graph: most-linked notes + cross-domain bridges (Feature 022). */
  knowledgeGraph: KnowledgeGraphData;
  /** Current study streak (consecutive days with review/session). */
  streak: number;
  /** Planned + completed today session counts. */
  plannedCount: number;
  completedToday: number;
  /** Last 5 completed sessions. */
  recentSessions: RecentSession[];
  /** 12-week activity heatmap. */
  heatmap: HeatmapDay[];
}

export function useDashboard(refreshKey = 0): DashboardData {
  const db = useDb();
  const vaultId = useActiveVaultId();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [courseGroups, setCourseGroups] = useState<DashboardCourseGroup[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [overconfident, setOverconfident] = useState<Card[]>([]);
  const [gapCounts, setGapCounts] = useState<GapCountByCourse[]>([]);
  const [dailyMix, setDailyMix] = useState<DailyMixItem[]>([]);
  const [coldDomains, setColdDomains] = useState<ColdDomain[]>([]);
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraphData>({
    mostLinked: [],
    crossDomainBridges: [],
  });
  const [streak, setStreak] = useState(0);
  const [plannedCount, setPlannedCount] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vaultId) {
      // No active vault → nothing to scope to; the route shows connect-a-vault guidance.
      setSummary(null);
      setCourseGroups([]);
      setDueCount(0);
      setOverconfident([]);
      setGapCounts([]);
      setDailyMix([]);
      setColdDomains([]);
      setKnowledgeGraph({ mostLinked: [], crossDomainBridges: [] });
      setStreak(0);
      setPlannedCount(0);
      setCompletedToday(0);
      setRecentSessions([]);
      setHeatmap([]);
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
      // Feature 021 interleaving — loaded separately so a scheduler error doesn't block
      // the core dashboard summary (Constitution III: never fabricate, start from real data).
      const [mix, cold] = await Promise.all([
        getDailyMix(db, vaultId).catch(() => [] as DailyMixItem[]),
        getColdDomains(db, vaultId).catch(() => [] as ColdDomain[]),
      ]);
      // Feature 022 knowledge graph — pure read-model, loaded separately.
      const kg = await getLinkedNotes(db, vaultId).catch(
        () => ({ mostLinked: [], crossDomainBridges: [] } as KnowledgeGraphData),
      );
      // Activity data (streak, protocol, sessions, heatmap) — loaded separately.
      const [strk, proto, sessions, hm] = await Promise.all([
        getCurrentStreak(db, vaultId).catch(() => 0),
        getTodayProtocol(db, vaultId).catch(() => ({ plannedCount: 0, completedToday: 0 })),
        getRecentSessions(db, vaultId).catch(() => [] as RecentSession[]),
        getActivityHeatmap(db, vaultId).catch(() => [] as HeatmapDay[]),
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
      setDailyMix(mix);
      setColdDomains(cold);
      setKnowledgeGraph(kg);
      setStreak(strk);
      setPlannedCount(proto.plannedCount);
      setCompletedToday(proto.completedToday);
      setRecentSessions(sessions);
      setHeatmap(hm);
    })().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [db, vaultId, refreshKey]);

  return { loading, summary, courseGroups, dueCount, overconfident, gapCounts, dailyMix, coldDomains, knowledgeGraph, streak, plannedCount, completedToday, recentSessions, heatmap };
}
