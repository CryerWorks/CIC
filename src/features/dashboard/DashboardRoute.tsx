import { Link } from "react-router-dom";
import { Panel, StatCell, Tag, Callout } from "../../components/ui";
import { useVaultState } from "../../app/providers/VaultProvider";
import { useDbState } from "../../app/providers/DbProvider";
import { useDashboard } from "./useDashboard";
import { MilestoneProgress } from "./MilestoneProgress";
import { DomainAllocation } from "./DomainAllocation";
import { DeferredTiles } from "./DeferredTiles";

/**
 * The Command Center Dashboard (F8) — a real, read-only summary of the Domain → Course → Milestone
 * hierarchy. Not vault-gated (the data is SQLite-only); vault status is surfaced alongside. It does
 * gate the data subtree on the store being ready (so it is self-sufficient even outside the
 * AppShell store-gate). The retention tiles are honest Phase-2 placeholders (see DeferredTiles).
 */
export function DashboardRoute() {
  const db = useDbState();
  const vault = useVaultState();

  return (
    <div className="flex flex-col gap-6">
      {vault.status === "unset" && (
        <Callout variant="info" title="No vault connected">
          <span>
            Choose your Obsidian vault to start capturing knowledge.{" "}
            <Link to="/vault" className="font-medium text-brand underline">
              Choose your vault
            </Link>
          </span>
        </Callout>
      )}

      {db.status === "error" ? (
        <Callout variant="danger" title="Couldn't load your data">
          {db.error.message}
        </Callout>
      ) : db.status !== "ready" ? (
        <p className="text-text-dim">Loading…</p>
      ) : (
        <DashboardView vaultReady={vault.status === "ready"} />
      )}
    </div>
  );
}

function DashboardView({ vaultReady }: { vaultReady: boolean }) {
  const { loading, summary, courseGroups } = useDashboard();

  if (loading || !summary) return <p className="text-text-dim">Loading…</p>;
  if (summary.totals.domains === 0) return <Onboarding vaultReady={vaultReady} />;

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Command Center</h1>
        {vaultReady && (
          <span className="flex items-center gap-1.5 text-xs text-text-dim">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success" /> Vault connected
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 gap-3">
        <StatCell label="Domains" value={summary.totals.domains} />
        <StatCell label="Courses" value={summary.totals.courses} />
        <StatCell label="Milestones" value={summary.totals.milestones} />
      </div>

      <MilestoneProgress progress={summary.milestoneProgress} />
      <DomainAllocation allocation={summary.allocation} />

      {courseGroups.some((g) => g.courses.length > 0) && (
        <Panel title="Courses">
          <div className="flex flex-col gap-4">
            {courseGroups
              .filter((g) => g.courses.length > 0)
              .map((g) => (
                <section key={g.domain.id} className="flex flex-col gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-text-dim">
                    <span
                      aria-hidden
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: g.domain.color }}
                    />
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

      <DeferredTiles />
    </>
  );
}

function Onboarding({ vaultReady }: { vaultReady: boolean }) {
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
        {!vaultReady && (
          <p className="mt-3 text-xs text-text-dim">
            Tip: connect your Obsidian vault from the Vault screen to materialize Courses as notes.
          </p>
        )}
      </div>
    </Panel>
  );
}
