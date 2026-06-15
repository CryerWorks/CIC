import type { DailyMixItem } from "../interleaving/scheduler";

const REASON_LABEL: Record<DailyMixItem["reason"], string> = {
  planned: "planned today",
  "due-review": "due for review",
  cold: "neglected",
};

/**
 * "Today's Mix" dashboard tile (Feature 021 / F6). Shows 3-5 study recommendations
 * from the interleaving scheduler, one per line with the reason it was suggested.
 * Renders nothing when there are no recommendations (no fabricated data — Constitution III).
 */
export function DailyMixTile({ items }: { items: DailyMixItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
      <span className="text-xs text-text-dim">Today's Mix</span>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.courseId} className="flex items-center justify-between text-xs">
            <span className="truncate text-text" title={item.courseTitle}>
              {item.courseTitle}
            </span>
            <span className="ml-2 shrink-0 text-text-dim">{REASON_LABEL[item.reason]}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-[11px] text-text-dim">
        {items.length === 1 ? "1 recommendation" : `${items.length} recommendations`}
      </div>
    </div>
  );
}
