import { Panel } from "../../components/ui";
import type { MilestoneProgress as MilestoneProgressData } from "../../db";

/** Overall milestone progress: a done/in-progress segmented bar + a "X/Y done (Z%)" label.
 *  When there are no milestones, says so rather than rendering an empty bar or "NaN%". */
export function MilestoneProgress({ progress }: { progress: MilestoneProgressData }) {
  const { todo, inProgress, done, total, percentDone } = progress;

  if (total === 0) {
    return (
      <Panel title="Milestone progress">
        <p className="text-sm text-text-dim">
          No milestones yet — add some to a Course to start tracking progress.
        </p>
      </Panel>
    );
  }

  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <Panel title="Milestone progress">
      <div className="flex flex-col gap-2">
        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="img"
          aria-label={`${done} of ${total} milestones done, ${percentDone}%`}
        >
          <div className="bg-success" style={{ width: pct(done) }} />
          <div className="bg-brand" style={{ width: pct(inProgress) }} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text">
            {`${done}/${total} done `}
            <span className="text-text-dim">{`(${percentDone}%)`}</span>
          </span>
          <span className="text-xs text-text-dim">
            {`${done} done · ${inProgress} in progress · ${todo} to do`}
          </span>
        </div>
      </div>
    </Panel>
  );
}
