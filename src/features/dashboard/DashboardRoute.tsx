import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Panel, StatCell, Tag, Callout } from "../../components/ui";
import { useVaultState, useVault, useActiveVaultId } from "../../app/providers/VaultProvider";
import { useDbState, useDb } from "../../app/providers/DbProvider";
import { reconcileCompleted } from "../../db";
import { useDashboard } from "./useDashboard";
import { MilestoneProgress } from "./MilestoneProgress";
import { DomainAllocation } from "./DomainAllocation";
import { OverconfidentTile } from "./OverconfidentTile";
import { GapsTile } from "./GapsTile";
import { DailyMixTile } from "./DailyMixTile";
import { ColdTile } from "./ColdTile";
import { KnowledgeGraph } from "./KnowledgeGraph";
import { QuickActions } from "./QuickActions";
import { ActivitySection } from "./ActivitySection";

/**
 * The Command Center Dashboard (F8) — a real, read-only summary of the active vault's Domain →
 * Course → Milestone hierarchy (vault-scoped per Feature 009).
 */
export function DashboardRoute() {
  const db = useDbState();
  const vault = useVaultState();

  return (
    <div className="flex flex-col gap-6">
      {db.status === "error" ? (
        <Callout variant="danger" title="Couldn't load your data">
          {db.error.message}
        </Callout>
      ) : db.status !== "ready" || vault.status === "checking" ? (
        <p className="text-text-dim">Loading…</p>
      ) : vault.status !== "ready" ? (
        <Callout variant="info" title="No vault connected">
          <span>
            Connect your Obsidian vault to see this vault's dashboard.{" "}
            <Link to="/vault" className="font-medium text-brand underline">
              Choose your vault
            </Link>
          </span>
        </Callout>
      ) : (
        <DashboardView />
      )}
    </div>
  );
}

function DashboardView() {
  const [refreshKey, setRefreshKey] = useState(0);
  const {
    loading, summary, courseGroups, dueCount, overconfident, gapCounts,
    dailyMix, coldDomains, knowledgeGraph, streak, plannedCount, recentSessions, heatmap,
  } = useDashboard(refreshKey);
  const vault = useVault();
  const db = useDb();
  const vaultId = useActiveVaultId();

  const handleRefreshGaps = useCallback(async () => {
    if (!vaultId) return;
    await reconcileCompleted(db, vaultId, async (notePath) => {
      try {
        const note = await vault.reader.readNote(notePath);
        return note.body;
      } catch {
        return null;
      }
    });
    setRefreshKey((k) => k + 1);
  }, [db, vaultId, vault.reader]);

  if (loading || !summary) return <p className="text-text-dim">Loading…</p>;
  if (summary.totals.domains === 0) return <Onboarding />;

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Command Center</h1>
        <span className="flex items-center gap-1.5 text-xs text-text-dim">
          <span aria-hidden className="h-2 w-2 rounded-full bg-success" /> Vault connected
        </span>
      </header>

      {/* ── Today ── */}
      <Panel title="Today">
        <div className="flex flex-col gap-3">
          <QuickActions />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Link
              to="/review"
              className="rounded-md border border-line bg-surface-sunken px-3 py-2 hover:border-line-bright"
            >
              <span className="text-xs text-text-dim">Due for review</span>
              <div className="mt-1 font-mono text-2xl font-bold text-text">{dueCount}</div>
              <div className="text-[11px] text-text-dim">cards</div>
            </Link>
            <OverconfidentTile cards={overconfident} />
            {gapCounts.length > 0 && <GapsTile gaps={gapCounts} onRefresh={handleRefreshGaps} />}
            <DailyMixTile items={dailyMix} />
            <ColdTile domains={coldDomains} />
          </div>
        </div>
      </Panel>

      {/* ── Progress ── */}
      <Panel title="Progress">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCell label="Domains" value={summary.totals.domains} />
            <StatCell label="Courses" value={summary.totals.courses} />
            <StatCell label="Milestones" value={summary.totals.milestones} />
          </div>
          <MilestoneProgress progress={summary.milestoneProgress} />
          <DomainAllocation allocation={summary.allocation} />
        </div>
      </Panel>

      {/* ── Courses ── */}
      {courseGroups.some((g) => g.courses.length > 0) && (
        <Panel title="Courses">
          <div className="flex flex-col gap-4">
            {courseGroups
              .filter((g) => g.courses.length > 0)
              .map((g) => (
                <section key={g.domain.id} className="flex flex-col gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-text-dim">
                    <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: g.domain.color }} />
                    {g.domain.name}
                  </h2>
                  <ul className="flex flex-col gap-1.5">
                    {g.courses.map((c) => (
                      <li key={c.id}>
                        <Link
                          to="/courses"
                          className="flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2 hover:border-line-bright"
                        >
                          <span className="text-text">{c.title}</span>
                          {c.moc_path && <Tag tone="neutral">MOC</Tag>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        </Panel>
      )}

      {/* ── Active Projects ── */}
      {summary.activeProjects.length > 0 && (
        <Panel title="Active projects">
          <ul className="flex flex-col gap-1.5">
            {summary.activeProjects.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/courses/${p.courseId}`}
                  className="flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2 hover:border-line-bright"
                >
                  <span className="text-text">{p.title}</span>
                  <Tag tone="neutral">project</Tag>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ── Activity ── */}
      <Panel title="Activity">
        <ActivitySection
          streak={streak}
          plannedCount={plannedCount}
          recentSessions={recentSessions}
          heatmap={heatmap}
        />
      </Panel>

      {/* ── Knowledge Graph ── */}
      {(knowledgeGraph.mostLinked.length > 0 || knowledgeGraph.crossDomainBridges.length > 0) && (
        <Panel title="Knowledge Graph">
          <KnowledgeGraph
            mostLinked={knowledgeGraph.mostLinked}
            crossDomainBridges={knowledgeGraph.crossDomainBridges}
          />
        </Panel>
      )}
    </>
  );
}

function Onboarding() {
  return (
    <Panel>
      <div className="py-8 text-center">
        <h1 className="text-lg font-bold text-text">Welcome to CIC</h1>
        <p className="mt-1 text-sm text-text-dim">
          Start by creating a Domain — a top-level subject area. Add Courses and Milestones, and
          your dashboard fills in.
        </p>
        <div className="mt-4 flex justify-center">
          <Link
            to="/domains"
            className="inline-flex items-center rounded-sm bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-dim"
          >
            Create your first Domain
          </Link>
        </div>
      </div>
    </Panel>
  );
}
