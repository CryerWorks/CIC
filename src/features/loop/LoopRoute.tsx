import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Panel, Button, Callout, Tag } from "../../components/ui";
import { useVaultState, useActiveVaultId } from "../../app/providers/VaultProvider";
import { useDb } from "../../app/providers/DbProvider";
import { listPlannedSessions, listSessionsByVault, type SessionListItem } from "../../db";
import { useDailyLoop } from "./useDailyLoop";
import { Stepper, type Step } from "./Stepper";
import { PretestStep } from "./steps/PretestStep";
import { PlanningStep } from "./steps/PlanningStep";
import { ActiveStudyStep } from "./steps/ActiveStudyStep";
import { RetrievalStep } from "./steps/RetrievalStep";
import { NoteStep } from "./steps/NoteStep";
import { SelfTestStep } from "./steps/SelfTestStep";
import { MakeCardsStep } from "./steps/MakeCardsStep";
import { FinishStep } from "./steps/FinishStep";

/** The Daily Loop (Feature 012, PRD F2) — the **doing** surface. Vault-gated; lists the active
 *  vault's planned sessions to do (planned on a Course) plus recent completed ones. */
export function LoopRoute() {
  const vault = useVaultState();
  if (vault.status === "checking") return <p className="text-text-dim">Loading…</p>;
  if (vault.status !== "ready") {
    return (
      <div className="mx-auto max-w-2xl">
        <Callout variant="info" title="Connect a vault first">
          <span>
            <Link to="/vault" className="font-medium text-brand underline">
              Choose your vault
            </Link>{" "}
            to run a learning session.
          </span>
        </Callout>
      </div>
    );
  }
  return <LoopManager />;
}

function LoopManager() {
  const db = useDb();
  const vaultId = useActiveVaultId() ?? "";
  const [doingId, setDoingId] = useState<string | null>(null);
  const [planned, setPlanned] = useState<SessionListItem[]>([]);
  const [recent, setRecent] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    void Promise.all([
      listPlannedSessions(db, vaultId),
      listSessionsByVault(db, vaultId, { status: "completed", limit: 10 }),
    ]).then(([p, r]) => {
      setPlanned(p);
      setRecent(r);
      setLoading(false);
    });
  }, [db, vaultId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (doingId) {
    return (
      <SessionFlow
        sessionId={doingId}
        onExit={() => {
          setDoingId(null);
          reload();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-text">Daily Loop</h1>

      {loading ? (
        <p className="text-text-dim">Loading…</p>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-text-dim">Planned sessions</h2>
          {planned.length === 0 ? (
            <Panel>
              <div className="py-8 text-center">
                <p className="text-text">Nothing planned yet.</p>
                <p className="mt-1 text-sm text-text-dim">
                  Plan a session from a{" "}
                  <Link to="/courses" className="font-medium text-brand underline">
                    Course
                  </Link>
                  , then do it here.
                </p>
              </div>
            </Panel>
          ) : (
            <ul className="flex flex-col gap-2">
              {planned.map((s) => (
                <li key={s.session.id}>
                  <Panel>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-text">{s.session.objective ?? "(no objective)"}</p>
                        <p className="truncate text-xs text-text-dim">
                          {s.session.date.slice(0, 10)} · {s.courseTitle}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setDoingId(s.session.id)}>
                        Start
                      </Button>
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          )}

          {recent.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-text-dim">Recent sessions</h2>
              <ul className="flex flex-col gap-2">
                {recent.map((s) => (
                  <li key={s.session.id}>
                    <Panel>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-text">{s.session.objective ?? "(no objective)"}</p>
                          <p className="truncate text-xs text-text-dim">
                            {(s.session.completed_at ?? s.session.date).slice(0, 10)} · {s.courseTitle}
                            {s.session.writeup_path ? ` · ${s.session.writeup_path}` : ""}
                          </p>
                        </div>
                        <Tag tone="neutral">done</Tag>
                      </div>
                    </Panel>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Doing one planned session. Owns the in-session work via `useDailyLoop`; leaving without
 *  finishing (Cancel/navigation) leaves the session **planned** and re-doable — nothing partial is
 *  persisted (R11). */
function SessionFlow({ sessionId, onExit }: { sessionId: string; onExit: () => void }) {
  const loop = useDailyLoop(sessionId);

  if (loop.loading) return <p className="mx-auto max-w-2xl text-text-dim">Loading…</p>;

  const steps: Step[] = [
    {
      key: "planning",
      title: "Plan",
      content: <PlanningStep loop={loop} milestoneSessions={loop.milestoneSessions} />,
    },
    { key: "pretest", title: "Pretest", optional: true, content: <PretestStep loop={loop} /> },
    {
      key: "active-study",
      title: "Active study",
      optional: true,
      content: (
        <ActiveStudyStep
          loop={loop}
          sessionSources={loop.sessionSources}
          onToggleSourceDone={loop.onToggleSourceDone}
        />
      ),
    },
    { key: "retrieve", title: "Retrieve from memory", optional: true, content: <RetrievalStep loop={loop} /> },
    { key: "note", title: "Atomic note", optional: true, content: <NoteStep loop={loop} /> },
    { key: "self-test", title: "Self-test", optional: true, content: <SelfTestStep loop={loop} /> },
    { key: "make-cards", title: "Complete cards", optional: true, content: <MakeCardsStep loop={loop} /> },
    { key: "finish", title: "Finish", content: <FinishStep loop={loop} onDone={onExit} /> },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-text">Daily Loop</h1>
      <p className="mb-4 mt-1 text-sm text-text-dim">
        Objective: <span className="text-text">{loop.objective || "(none)"}</span>
      </p>
      <Panel>
        <Stepper steps={steps} onCancel={onExit} />
      </Panel>
    </div>
  );
}
