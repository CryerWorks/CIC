import { useEffect, useRef, useState } from "react";
import { Panel, Button } from "../../components/ui";
import { cx } from "../../components/ui/types";
import { useReview } from "./useReview";
import { ReviewCitations } from "./ReviewCitations";
import type { Grade } from "./fsrs/types";

const GRADES: { value: Grade; label: string; variant: "secondary" | "primary" }[] = [
  { value: "again", label: "Again", variant: "secondary" },
  { value: "hard", label: "Hard", variant: "secondary" },
  { value: "good", label: "Good", variant: "primary" },
  { value: "easy", label: "Easy", variant: "secondary" },
];
const CONFIDENCE = [1, 2, 3, 4, 5];

/** The review session: front → reveal → grade. The back is not rendered until the user reveals
 *  it (retrieval-before-reveal); a grade cannot be submitted until a confidence (1–5, no default)
 *  is chosen (Constitution III). */
export function ReviewSession() {
  const { loading, current, revealed, reveal, grade, remaining, done, cap, setNewCardCap } = useReview();
  const [confidence, setConfidence] = useState<number | null>(null);
  const shownAt = useRef<number>(Date.now());

  // Reset the per-review confidence + timer whenever a new card is shown.
  useEffect(() => {
    setConfidence(null);
    shownAt.current = Date.now();
  }, [current?.id]);

  const submit = async (g: Grade) => {
    if (confidence === null) return;
    await grade(g, confidence, Date.now() - shownAt.current);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-text">Review</h1>
        <label className="flex items-center gap-2 text-xs text-text-dim">
          New cards/day
          <input
            type="number"
            min={0}
            value={cap}
            onChange={(e) => void setNewCardCap(Number(e.target.value))}
            aria-label="New cards per day"
            className="w-16 rounded-sm border border-line bg-surface-sunken px-2 py-1 text-text"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-text-dim">Loading…</p>
      ) : done ? (
        <Panel>
          <div className="py-10 text-center">
            <p className="text-text">All caught up.</p>
            <p className="mt-1 text-sm text-text-dim">Nothing is due for review right now.</p>
          </div>
        </Panel>
      ) : current ? (
        <Panel>
          <div className="flex flex-col gap-4">
            <p className="text-right text-xs text-text-dim">{remaining} left</p>

            <div className="rounded-md bg-surface-sunken p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dim">Prompt</p>
              <p className="mt-1 whitespace-pre-wrap text-text">{current.front}</p>
            </div>

            {revealed && (
              <div className="rounded-md bg-surface-sunken p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-dim">Answer</p>
                <p className="mt-1 whitespace-pre-wrap text-text">{current.back}</p>
              </div>
            )}

            {revealed && <ReviewCitations cardId={current.id} />}

            {!revealed ? (
              <div>
                <Button onClick={reveal}>Show answer</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-dim">
                    How confident were you?
                  </p>
                  <div role="group" aria-label="Confidence" className="inline-flex gap-1">
                    {CONFIDENCE.map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`Confidence ${n}`}
                        aria-pressed={confidence === n}
                        onClick={() => setConfidence(n)}
                        className={cx(
                          "h-8 w-8 rounded-sm border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                          confidence === n
                            ? "border-brand bg-brand text-white"
                            : "border-line text-text-dim hover:text-text",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  {GRADES.map((g) => (
                    <Button
                      key={g.value}
                      variant={g.variant}
                      disabled={confidence === null}
                      onClick={() => void submit(g.value)}
                    >
                      {g.label}
                    </Button>
                  ))}
                </div>
                {confidence === null && (
                  <p className="text-xs text-text-dim">Pick a confidence to grade this card.</p>
                )}
              </div>
            )}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
