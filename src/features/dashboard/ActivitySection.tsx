import type { RecentSession, HeatmapDay } from "../../db";
import { ActivityHeatmap } from "./ActivityHeatmap";

interface ActivitySectionProps {
  streak: number;
  plannedCount: number;
  recentSessions: RecentSession[];
  heatmap: HeatmapDay[];
}

/**
 * Activity section — replaces the old DeferredTiles. Shows real data:
 * current streak, planned sessions to do, 12-week heatmap, and recent sessions.
 */
export function ActivitySection({ streak, plannedCount, recentSessions, heatmap }: ActivitySectionProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Streak */}
      <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
        <span className="text-xs text-text-dim">Current streak</span>
        <div className="mt-1 font-mono text-2xl font-bold text-text">
          {streak > 0 ? streak : "—"}
        </div>
        <div className="text-[11px] text-text-dim">
          {streak === 0 ? "no activity today" : streak === 1 ? "1 day" : `${streak} days`}
        </div>
      </div>

      {/* Today's protocol */}
      <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
        <span className="text-xs text-text-dim">Planned sessions</span>
        <div className="mt-1 font-mono text-2xl font-bold text-text">{plannedCount}</div>
        <div className="text-[11px] text-text-dim">
          {plannedCount === 0 ? "none planned" : "waiting in Daily Loop"}
        </div>
      </div>

      {/* Heatmap label */}
      <div className="rounded-md border border-line bg-surface-sunken px-3 py-2 sm:col-span-2">
        <span className="text-xs text-text-dim">12-week activity</span>
        <div className="mt-1 flex justify-center sm:justify-start">
          <ActivityHeatmap days={heatmap} />
        </div>
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div className="col-span-full rounded-md border border-line bg-surface-sunken px-3 py-2">
          <span className="text-xs text-text-dim">Recent sessions</span>
          <ul className="mt-2 flex flex-col gap-1">
            {recentSessions.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs text-text-dim">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.domainColor }} />
                <span className="truncate font-medium text-text">{s.courseTitle}</span>
                <span className="truncate">{s.objective}</span>
                <span className="ml-auto shrink-0">
                  {new Date(s.completedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
