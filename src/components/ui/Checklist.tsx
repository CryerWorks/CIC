import { cx } from "./types";

export interface ChecklistItem {
  id: string;
  label: string;
  done?: boolean;
}

interface ChecklistProps {
  items: ChecklistItem[];
  onToggle?: (id: string) => void;
  className?: string;
}

// Presentational: emits onToggle; owns no "learned" state (Constitution III / research R6).
export function Checklist({ items, onToggle, className }: ChecklistProps) {
  return (
    <ul className={cx("flex flex-col", className)}>
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-2.5 border-b border-line py-2 text-sm last:border-b-0">
          <input
            id={`chk-${it.id}`}
            type="checkbox"
            checked={!!it.done}
            onChange={() => onToggle?.(it.id)}
            className="size-4 accent-brand"
          />
          <label htmlFor={`chk-${it.id}`} className={cx("cursor-pointer", it.done ? "text-text-dim line-through" : "text-text")}>
            {it.label}
          </label>
        </li>
      ))}
    </ul>
  );
}
