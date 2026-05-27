import type { ReactNode } from "react";
import { cx } from "./types";

interface StatCellProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  trend?: "up" | "down" | "flat";
  className?: string;
}

const trendColor = { up: "text-success", down: "text-danger", flat: "text-text-dim" } as const;
const trendGlyph = { up: "▲", down: "▼", flat: "—" } as const;

export function StatCell({ label, value, unit, trend, className }: StatCellProps) {
  return (
    <div className={cx("rounded-md border border-line bg-panel px-4 py-3", className)}>
      <div className="text-xs text-text-dim">{label}</div>
      <div className="mt-1 break-words font-mono text-2xl font-bold leading-tight text-text">
        {value}
        {unit && <small className="ml-1 text-sm font-medium text-text-dim">{unit}</small>}
        {trend && <span className={cx("ml-2 text-xs", trendColor[trend])}>{trendGlyph[trend]}</span>}
      </div>
    </div>
  );
}
