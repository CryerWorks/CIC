import { Button } from "../../../components/ui";
import type { AssignmentKind } from "../../../db";
import { resourceTarget, openCitation } from "../../srs/citations/openTarget";
import type { DailyLoop } from "../useDailyLoop";

const KIND_LABEL: Record<AssignmentKind, string> = { read: "Read", watch: "Watch", listen: "Listen", review: "Review" };

/** Active study (F2.3) — open each **pre-assigned** source (chosen at plan time) at its locator via
 *  the existing best-effort opener seam (010/011). A non-openable kind shows its locator as text
 *  rather than failing silently (FR-014). `open` is injected for tests. */
export function ActiveStudyStep({
  loop,
  open = openCitation,
}: {
  loop: DailyLoop;
  open?: (target: string | null) => Promise<{ opened: boolean }>;
}) {
  if (loop.assignments.length === 0) {
    return <p className="text-sm text-text-dim">No assignments were planned for this session.</p>;
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-text-dim">Study each source, opening it at the assigned place.</p>
      <ul className="flex flex-col gap-1">
        {loop.assignments.map((a, i) => {
          const target = a.resource ? resourceTarget(a.resource, a.locator?.trim() || null) : null;
          return (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-text">
                {a.resource?.title ?? a.resourceId} <span className="text-text-dim">({KIND_LABEL[a.kind]})</span>
                {a.locator?.trim() && <span className="text-text-dim"> · {a.locator.trim()}</span>}
              </span>
              {target ? (
                <Button size="sm" variant="secondary" onClick={() => void open(target)}>
                  Open
                </Button>
              ) : (
                <span className="shrink-0 text-xs text-text-dim">{a.locator?.trim() || "no auto-open"}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
