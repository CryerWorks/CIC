import { Button, Callout } from "../../../components/ui";
import type { DailyLoop } from "../useDailyLoop";

/** Step 8 — review + finish. Persists the session (DB) then writes the vault writeup; a vault
 *  failure leaves the session saved and offers a retry (R7). On success, `onDone` returns to the
 *  landing. Finishing records the session only — it marks nothing "learned" (Constitution III). */
export function FinishStep({ loop, onDone }: { loop: DailyLoop; onDone: () => void }) {
  const f = loop.finish;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="flex flex-col gap-1 text-text-dim">
        <li>Objective: <span className="text-text">{loop.objective.trim() || "—"}</span></li>
        <li>Assignments studied: {loop.assignments.length}</li>
        <li>Pretest questions: {loop.pretest.length}</li>
        <li>Cards to make: {loop.cards.filter((c) => c.front.trim() && c.back.trim()).length}</li>
      </ul>

      {f.status !== "done" && (
        <div>
          <Button disabled={f.status === "saving"} onClick={() => void loop.runFinish()}>
            {f.status === "saving" ? "Finishing…" : "Finish session"}
          </Button>
        </div>
      )}

      {f.status === "error" && (
        <Callout variant="warn" title="Couldn't complete the writeup">
          <div className="flex flex-col gap-2">
            <span>
              {f.message}
              {f.canRetry ? " Your session was saved." : ""}
            </span>
            {f.canRetry && (
              <div>
                <Button size="sm" onClick={() => void loop.retry()}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </Callout>
      )}

      {f.status === "done" && (
        <Callout variant="info" title="Session recorded">
          <div className="flex flex-col gap-2">
            <span>
              Writeup saved to <span className="font-mono text-text">{f.writeupPath}</span>.
            </span>
            {f.noteWarning && <span className="text-text-dim">{f.noteWarning}</span>}
            <div>
              <Button size="sm" onClick={onDone}>
                Done
              </Button>
            </div>
          </div>
        </Callout>
      )}
    </div>
  );
}
