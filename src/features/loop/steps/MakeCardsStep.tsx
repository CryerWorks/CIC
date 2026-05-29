import { Button } from "../../../components/ui";
import type { DailyLoop } from "../useDailyLoop";
import { FIELD } from "./field";

/** Complete cards — finish the card prompts staged at plan time (fill the back, edit the front) and
 *  optionally add more. On finish each completed card (non-empty front + back) becomes a **new** SRS
 *  card citing the session's studied resources (F3.7). Nothing is marked "learned" (Constitution
 *  III). A card with the same resource cited twice collapses to one citation in the repo (D1). */
export function MakeCardsStep({ loop }: { loop: DailyLoop }) {
  const citedTitles = Array.from(
    new Map(loop.assignments.map((a) => [a.resourceId, a.resource?.title ?? a.resourceId])).values(),
  );

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-text-dim">
        Complete the cards you planned (and add any more). They join your review queue as new.
        {citedTitles.length > 0 && (
          <>
            {" "}
            Each will cite: <span className="text-text">{citedTitles.join(", ")}</span>.
          </>
        )}
      </p>

      {loop.cards.length === 0 ? (
        <p className="text-text-dim">No cards were planned — add one if you like.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {loop.cards.map((c, i) => (
            <li key={c.key} className="flex flex-col gap-2 rounded-sm border border-line p-3">
              <label className="flex flex-col gap-1">
                <span className="font-medium text-text">Front {i + 1}</span>
                <textarea
                  aria-label={`Card ${i + 1} front`}
                  rows={2}
                  value={c.front}
                  onChange={(e) => loop.setCardField(c.key, "front", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium text-text">Back {i + 1}</span>
                <textarea
                  aria-label={`Card ${i + 1} back`}
                  rows={2}
                  value={c.back}
                  onChange={(e) => loop.setCardField(c.key, "back", e.target.value)}
                  className={FIELD}
                />
              </label>
              <div>
                <Button size="sm" variant="ghost" onClick={() => loop.removeCard(c.key)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button size="sm" variant="secondary" onClick={loop.addCard}>
          Add a card
        </Button>
      </div>
    </div>
  );
}
