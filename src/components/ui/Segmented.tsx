import type { KeyboardEvent } from "react";
import { cx } from "./types";

export interface SegOption {
  value: string;
  label: string;
}

interface SegmentedProps {
  options: SegOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

// Accessible segmented control: a radiogroup with roving tabindex + arrow/Home/End keys.
export function Segmented({ options, value, onChange, ariaLabel, className }: SegmentedProps) {
  const move = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const last = options.length - 1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(options[(idx + 1) % options.length].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(options[(idx - 1 + options.length) % options.length].value);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(options[0].value);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(options[last].value);
    }
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx("inline-flex rounded-md border border-line bg-surface-sunken p-0.5", className)}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            className={cx(
              "rounded-sm px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              checked ? "bg-brand text-white" : "text-text-dim hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
