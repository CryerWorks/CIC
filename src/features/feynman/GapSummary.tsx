/**
 * GapSummary — Displays a list of identified knowledge gaps with "Save to Session" / "Save as
 * Note" context-dependent action buttons. Designed to be used both inline in the FeynmanPanel
 * and as a standalone summary view after a Feynman conversation.
 */
import { useState, useCallback } from "react";
import { Button } from "../../components/ui/Button";
import type { FeynmanGap, GapSaveTarget } from "../../ai/features/feynman/types";

interface GapSummaryProps {
  /** The gaps to display. */
  gaps: FeynmanGap[];
  /** Whether gaps are currently being saved. */
  saving?: boolean;
  /** Whether gaps have been successfully saved. */
  saved?: boolean;
  /** Called when the user clicks a save button. Receives the target type. */
  onSave?: (targetType: GapSaveTarget["type"]) => void;
  /** If true, show both "Save to Session" and "Save as Note" buttons. Default: show a single
   *  "Save Gaps" button (type determined by the parent). */
  dualAction?: boolean;
  /** Optional: when dualAction is false, which target type to label the button for. */
  defaultTargetType?: GapSaveTarget["type"];
}

export function GapSummary({
  gaps,
  saving = false,
  saved = false,
  onSave,
  dualAction = false,
  defaultTargetType = "session-writeup",
}: GapSummaryProps) {
  const [expanded, setExpanded] = useState(true);

  const handleSave = useCallback(
    (targetType: GapSaveTarget["type"]) => {
      onSave?.(targetType);
    },
    [onSave],
  );

  if (gaps.length === 0) return null;

  return (
    <div className="rounded-md border border-line bg-surface-sunken">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-text-dim hover:text-text transition-colors"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse gaps list" : "Expand gaps list"}
      >
        <span>Identified Gaps ({gaps.length})</span>
        <span aria-hidden className="text-text-dim transition-transform" style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
          ▼
        </span>
      </button>

      {/* Gap list */}
      {expanded && (
        <div className="px-3 pb-3">
          <ul className="mb-3 flex flex-col gap-1.5">
            {gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-text">
                <span aria-hidden className="mt-0.5 shrink-0 text-text-dim">•</span>
                <span>
                  {g.text}
                  {g.sourceName && (
                    <span className="ml-1 text-text-dim">({g.sourceName})</span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/* Save actions */}
          {saved ? (
            <p className="text-xs text-success">✓ Gaps saved successfully.</p>
          ) : dualAction ? (
            <div className="flex gap-2">
              <Button size="sm" variant="primary" disabled={saving} onClick={() => handleSave("session-writeup")}>
                {saving ? "Saving…" : "Save to Session"}
              </Button>
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => handleSave("standalone-note")}>
                {saving ? "Saving…" : "Save as Note"}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="primary" disabled={saving} onClick={() => handleSave(defaultTargetType)}>
              {saving ? "Saving…" : `Save ${defaultTargetType === "standalone-note" ? "as Note" : "to Session"}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
