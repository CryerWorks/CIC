import type { HeatmapDay } from "../../db";

interface ActivityHeatmapProps {
  days: HeatmapDay[];
}

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-surface-sunken",
  1: "bg-brand/20",
  2: "bg-brand/40",
  3: "bg-brand/70",
  4: "bg-brand",
};

/**
 * 12-week activity heatmap (GitHub-style grid).
 * Pure presentational — data from getActivityHeatmap().
 */
export function ActivityHeatmap({ days }: ActivityHeatmapProps) {
  if (days.length === 0) return null;

  // Group into weeks (7 columns = Sun-Sat, rows = 12 weeks)
  const weeks: HeatmapDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="flex gap-1">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map((day) => (
            <div
              key={day.day}
              className={`h-3 w-3 rounded-sm ${LEVEL_COLORS[day.level]}`}
              title={`${day.day}: ${day.count} reviews/sessions`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
