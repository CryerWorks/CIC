import { cx, type RateValue } from "./types";

interface RatingProps {
  options?: RateValue[];
  onRate?: (value: RateValue) => void;
  disabled?: boolean;
  className?: string;
}

const labels: Record<RateValue, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };
const tone: Record<RateValue, string> = { again: "text-danger", hard: "text-warn", good: "text-success", easy: "text-info" };

// SHELL only — emits onRate; performs no scheduling, no auto-advance, no reveal
// (Constitution III / research R6). The SRS feature wires the actual FSRS behavior later.
export function Rating({ options = ["again", "hard", "good", "easy"], onRate, disabled, className }: RatingProps) {
  return (
    <div className={cx("grid grid-cols-4 gap-2", className)}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => onRate?.(o)}
          className={cx(
            "rounded-sm border border-line-bright bg-panel px-2 py-2 text-center text-xs font-semibold",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50",
            tone[o],
          )}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}
