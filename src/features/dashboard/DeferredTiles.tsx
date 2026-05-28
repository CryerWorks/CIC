import { Panel, Tag } from "../../components/ui";

/**
 * The war-room retention tiles, shown as honest placeholders. Their data — streaks, the Daily
 * Loop, the activity heatmap, sessions, SRS review queue — does not exist until Phase 2, so each
 * tile is a muted shell with a "Phase 2" tag and an em-dash where a value will go. We deliberately
 * render NO fabricated number and NO populated heatmap, and nothing here marks anything "learned"
 * (Constitution III — preserve desirable difficulty; never fake retention signals).
 */
const TILES = [
  { label: "Current streak", note: "review streak" },
  { label: "Today's protocol", note: "Daily Loop checklist" },
  { label: "Activity", note: "12-week heatmap" },
  { label: "Recent sessions", note: "study sessions" },
  { label: "Due cards", note: "SRS review queue" },
] as const;

export function DeferredTiles() {
  return (
    <Panel title="Retention">
      <p className="mb-3 text-sm text-text-dim">
        Streaks, the Daily Loop, the activity heatmap, and SRS review arrive in Phase 2 — shown here
        so the layout is ready. Nothing is tracked until you start studying.
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TILES.map((t) => (
          <li
            key={t.label}
            className="rounded-md border border-line bg-surface-sunken px-3 py-2 opacity-70"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-text-dim">{t.label}</span>
              <Tag tone="neutral">Phase 2</Tag>
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-text-dim" aria-hidden>
              —
            </div>
            <div className="text-[11px] text-text-dim">{t.note}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
