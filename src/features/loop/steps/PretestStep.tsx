import type { DailyLoop } from "../useDailyLoop";
import { FIELD } from "./field";

/** Pretest (F2.5) — attempt the questions established at plan time, from memory, before studying.
 *  Errorful generation: wrong answers are expected and useful, and nothing here is graded or scored
 *  (Constitution III). Answers are recorded to `pretest_responses` on finish and surfaced in the
 *  writeup as "what I thought vs what's true". */
export function PretestStep({ loop }: { loop: DailyLoop }) {
  if (loop.pretest.length === 0) {
    return <p className="text-sm text-text-dim">No pretest questions were planned for this session.</p>;
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-text-dim">
        Attempt these from memory before studying. Wrong answers are expected and useful — nothing here is graded.
      </p>
      <ul className="flex flex-col gap-3">
        {loop.pretest.map((p) => (
          <li key={p.id} className="flex flex-col gap-1">
            <span className="font-medium text-text">{p.question}</span>
            <input
              aria-label={`Answer: ${p.question}`}
              value={p.answer}
              onChange={(e) => loop.setPretestAnswer(p.id, e.target.value)}
              placeholder="From memory…"
              className={FIELD}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
