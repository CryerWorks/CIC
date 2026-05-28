import { cx } from "./types";

interface HeatmapProps {
  data: number[][];
  levels?: number;
  label?: string;
  className?: string;
}

// Intensity ramp (sunken → brand). Static representative sample in 002 (research R6).
const levelBg = ["bg-surface-sunken", "bg-brand-soft", "bg-brand-dim", "bg-brand"];

export function Heatmap({ data, levels = 3, label, className }: HeatmapProps) {
  const max = Math.max(1, ...data.flat());
  return (
    <div className={className}>
      {label && <div className="mb-2 text-xs text-text-dim">{label}</div>}
      <div className="flex flex-col gap-1">
        {data.map((row, r) => (
          <div key={r} className="flex gap-1">
            {row.map((v, c) => {
              const idx = Math.min(levels, Math.round((v / max) * levels));
              return (
                <div
                  key={c}
                  className={cx("size-3 rounded-sm", levelBg[Math.min(idx, levelBg.length - 1)])}
                  title={String(v)}
                  aria-hidden="true"
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
