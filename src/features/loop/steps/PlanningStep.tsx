import type { DailyLoop } from "../useDailyLoop";

interface SessionSummary {
  id: string;
  title: string;
  status: "completed" | "active" | "locked";
}

/** Planning step — shows session ordering within the current milestone. The learner sees their
 *  progress through the milestone's sessions as completed/active/locked tiles, providing context
 *  for the current session's position in the curriculum. */
export function PlanningStep({
  loop,
  milestoneSessions,
}: {
  loop: DailyLoop;
  milestoneSessions?: SessionSummary[];
}) {
  if (!milestoneSessions || milestoneSessions.length === 0) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-text-dim">
          Ready to study <span className="font-medium text-text">{loop.objective || "(no objective)"}</span>
        </p>
        <p className="text-xs text-text-dim">
          This session is part of your course: <span className="text-text">{loop.courseTitle}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-text-dim">
        Course: <span className="font-medium text-text">{loop.courseTitle}</span>
      </p>
      <p className="text-xs text-text-dim">Session progress within this milestone:</p>

      <ol className="flex flex-col gap-1.5">
        {milestoneSessions.map((s) => (
          <li key={s.id}>
            <div
              className={`flex items-center gap-2 rounded-sm border px-3 py-2 ${
                s.status === "completed"
                  ? "border-success/30 bg-success/5 text-text-dim"
                  : s.status === "active"
                    ? "border-brand/40 bg-brand/10 text-text"
                    : "border-line bg-panel text-text-faint"
              }`}
            >
              <span className="w-6 text-center text-sm">
                {s.status === "completed" ? "✅" : s.status === "active" ? "▶" : "🔒"}
              </span>
              <span
                className={`truncate ${
                  s.status === "active" ? "font-medium text-brand" : ""
                }`}
              >
                {s.title}
              </span>
              {s.status === "active" && (
                <span className="ml-auto shrink-0 text-2xs text-brand/70">Current</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
