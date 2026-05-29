import type { DailyLoop } from "../useDailyLoop";
import { FIELD } from "./field";

/** Step 6 — self-test. A manual stand-in for the future AI Feynman/Socratic panel (F4, Phase 3).
 *  Captured for the writeup; never graded (Constitution III). */
export function SelfTestStep({ loop }: { loop: DailyLoop }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-text-dim">Explain it in your own words, or quiz yourself. Nothing here is graded.</p>
      <textarea
        aria-label="Self-test"
        rows={6}
        value={loop.selfTestText}
        onChange={(e) => loop.setSelfTestText(e.target.value)}
        className={FIELD}
      />
    </div>
  );
}
