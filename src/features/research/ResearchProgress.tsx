/**
 * ResearchProgress — progress indicator for the AI Research Agent pipeline.
 *
 * Shows the current phase with a progress bar and message.
 * Phases: searching → fetching → evaluating → profiling → blueprinting → assembling → done
 */

import type { ResearchPhase } from "../../ai/features/research/types";

interface Props {
  /** Current phase of the research pipeline. */
  phase: ResearchPhase;
  /** Human-readable progress message. */
  message: string;
  /** Progress value within current phase (0-1). */
  progress: number;
}

/** Human-readable labels for each phase. */
const PHASE_LABELS: Record<ResearchPhase, string> = {
  idle: "Idle",
  searching: "Searching the web",
  fetching: "Fetching page content",
  evaluating: "Evaluating sources",
  profiling: "Calibrating learning profile",
  blueprinting: "Generating course blueprints",
  assembling: "Assembling campaign",
  done: "Complete!",
  error: "Error",
};

/** Phase order for display. */
const PHASE_ORDER: ResearchPhase[] = [
  "searching",
  "fetching",
  "evaluating",
  "profiling",
  "blueprinting",
  "assembling",
  "done",
];

export function ResearchProgress({ phase, message, progress }: Props) {
  const currentIdx = PHASE_ORDER.indexOf(phase);
  const isError = phase === "error";
  const isDone = phase === "done";
  const isIdle = phase === "idle";

  // Don't show anything in idle state
  if (isIdle) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Phase label */}
      <div className="flex items-center gap-2">
        {isError ? (
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
        ) : isDone ? (
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        ) : (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan" />
        )}
        <span
          className={`text-sm font-semibold ${
            isError ? "text-red-500" : isDone ? "text-green-500" : "text-cyan"
          }`}
        >
          {PHASE_LABELS[phase]}
        </span>
      </div>

      {/* Progress bar */}
      {!isDone && !isError && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-cyan transition-all duration-500 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      {/* Step indicators */}
      {!isDone && !isError && (
        <div className="flex flex-wrap gap-1.5">
          {PHASE_ORDER.map((p, i) => {
            const isActive = i === currentIdx;
            const isPast = i < currentIdx;
            return (
              <div
                key={p}
                className={`flex items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] ${
                  isActive
                    ? "bg-cyan/20 text-cyan font-semibold"
                    : isPast
                      ? "bg-green-500/10 text-green-600"
                      : "bg-surface-sunken text-text-dim"
                }`}
              >
                {isPast ? "✓" : isActive ? "●" : "○"} {PHASE_LABELS[p]}
              </div>
            );
          })}
        </div>
      )}

      {/* Message */}
      <p className="text-sm text-text-dim">{message}</p>
    </div>
  );
}
