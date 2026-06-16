import { Button } from "../../../components/ui";
import type { AssignmentKind } from "../../../db";
import type { SessionSourceRow } from "../../../db";
import { resourceTarget, openCitation } from "../../srs/citations/openTarget";
import type { DailyLoop } from "../useDailyLoop";
import { SessionSourceCard } from "../SessionSourceCard";

const KIND_LABEL: Record<AssignmentKind, string> = {
  read: "Read",
  watch: "Watch",
  listen: "Listen",
  review: "Review",
};

/** Active study (F2.3) — shows session sources as rich media cards with per-source checkmarks.
 *  When session sources are loaded (from session_sources table), the component renders
 *  SessionSourceCards with progress tracking. Falls back to the legacy assignment list for
 *  sessions planned before the session_sources feature. */
export function ActiveStudyStep({
  loop,
  sessionSources,
  onToggleSourceDone,
  open = openCitation,
}: {
  loop: DailyLoop;
  sessionSources?: SessionSourceRow[];
  onToggleSourceDone?: (sourceId: string) => void;
  open?: (target: string | null) => Promise<{ opened: boolean }>;
}) {
  // Session sources mode (new): render rich media cards
  if (sessionSources && sessionSources.length > 0) {
    const doneCount = sessionSources.filter((s) => s.completed).length;
    const totalCount = sessionSources.length;
    const allDone = doneCount === totalCount;

    return (
      <div className="flex flex-col gap-3 text-sm">
        {/* Progress indicator */}
        <div className="flex items-center justify-between">
          <p className="text-text-dim">
            {doneCount} of {totalCount} sources completed
            {!allDone && <span className="ml-1 text-text-faint">— finish all to unlock Feynman</span>}
          </p>
          {allDone && (
            <span className="rounded-sm bg-success/10 px-2 py-0.5 text-xs text-success">
              ✓ All sources done
            </span>
          )}
        </div>

        {/* Source grid */}
        <div className="flex flex-col gap-2">
          {sessionSources.map((source) => (
            <SessionSourceCard
              key={source.id}
              source={source}
              onToggleDone={() => onToggleSourceDone?.(source.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  // Legacy mode (before session_sources): show assignments as simple list
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
                {a.resource?.title ?? a.resourceId}{" "}
                <span className="text-text-dim">({KIND_LABEL[a.kind]})</span>
                {a.locator?.trim() && <span className="text-text-dim"> · {a.locator.trim()}</span>}
              </span>
              {target ? (
                <Button size="sm" variant="secondary" onClick={() => void open(target)}>
                  Open
                </Button>
              ) : (
                <span className="shrink-0 text-xs text-text-dim">
                  {a.locator?.trim() || "no auto-open"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
