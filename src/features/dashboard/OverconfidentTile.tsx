import type { Card } from "../../db";

/**
 * Calibration surface (F3.5): cards the learner was sure about but missed (high confidence +
 * "again" on the latest review). Real data only — nothing is shown as "learned" (Constitution
 * III); an empty list is the healthy state, not a fabricated number.
 */
export function OverconfidentTile({ cards }: { cards: Card[] }) {
  return (
    <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
      <span className="text-xs text-text-dim">Overconfident</span>
      <div className="mt-1 font-mono text-2xl font-bold text-text">{cards.length}</div>
      <div className="text-[11px] text-text-dim">felt sure, missed it</div>
      {cards.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          {cards.slice(0, 5).map((c) => (
            <li key={c.id} className="truncate text-xs text-text-dim" title={c.front}>
              {c.front}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
