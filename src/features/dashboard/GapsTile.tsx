import type { GapCountByCourse } from "../../db";

/**
 * "Gaps to Chase" dashboard tile (Feature 018). Shows the number of open knowledge gaps
 * identified by the Feynman Tutor, grouped by course. Only rendered when there are gaps
 * to chase (count > 0 per the parent). The optional `onRefresh` callback triggers a vault
 * rescan to reconcile gaps that the user marked completed in Obsidian.
 */
export function GapsTile({
  gaps,
  onRefresh,
}: {
  gaps: GapCountByCourse[];
  onRefresh?: () => void;
}) {
  if (gaps.length === 0) return null;

  const totalGaps = gaps.reduce((n, g) => n + g.count, 0);

  return (
    <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-dim">Gaps to Chase</span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-xs text-text-dim transition-colors hover:text-text"
            title="Refresh gaps from vault notes"
            type="button"
          >
            &#8635;
          </button>
        )}
      </div>
      <div className="mt-1 font-mono text-2xl font-bold text-text">{totalGaps}</div>
      <div className="text-[11px] text-text-dim">open knowledge gaps</div>
      {gaps.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          {gaps.map((g, i) => (
            <li key={g.courseId ?? `null-${i}`} className="flex items-center justify-between text-xs">
              <span className="truncate text-text-dim" title={g.courseTitle ?? "Uncategorized"}>
                {g.courseTitle ?? "Uncategorized"}
              </span>
              <span className="ml-2 shrink-0 font-mono text-text">{g.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
