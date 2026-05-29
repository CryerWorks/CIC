import type { DailyLoop } from "../useDailyLoop";
import { FIELD } from "./field";

/** Step 4 — retrieve from memory. The scratchpad starts empty and precedes re-opening sources
 *  (retrieval-before-reveal — Constitution III). Nothing is pre-filled. */
export function RetrievalStep({ loop }: { loop: DailyLoop }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-text-dim">Before re-opening your sources, write what you can recall from memory.</p>
      <textarea
        aria-label="Recall"
        rows={6}
        value={loop.retrievalText}
        onChange={(e) => loop.setRetrievalText(e.target.value)}
        placeholder="From memory…"
        className={FIELD}
      />
    </div>
  );
}
