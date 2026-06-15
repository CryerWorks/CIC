import { useState } from "react";
import type { DailyLoop } from "../useDailyLoop";
import { FIELD } from "./field";
import { FeynmanPanel } from "../../feynman/FeynmanPanel";
import { QuizPanel } from "../../quiz/QuizPanel";
import { Button } from "../../../components/ui";

/** Step 6 — self-test. A manual stand-in for the future AI Feynman/Socratic panel (F4, Phase 3).
 *  Captured for the writeup; never graded (Constitution III). */
export function SelfTestStep({ loop }: { loop: DailyLoop }) {
  const [showTutor, setShowTutor] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between">
        <p className="text-text-dim">Explain it in your own words, or quiz yourself. Nothing here is graded.</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowQuiz(true)}>
            Retrieval Quiz
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowTutor(true)}>
            Feynman Tutor
          </Button>
        </div>
      </div>
      <textarea
        aria-label="Self-test"
        rows={6}
        value={loop.selfTestText}
        onChange={(e) => loop.setSelfTestText(e.target.value)}
        className={FIELD}
      />

      {showTutor && (
        <FeynmanPanel
          gapSaveTarget={{
            type: "session-writeup",
            notePath: `Sessions/${loop.objective || "session"}.md`,
            courseId: undefined,
          }}
          onClose={() => setShowTutor(false)}
        />
      )}

      {showQuiz && (
        <QuizPanel
          topic={loop.objective || "this topic"}
          onClose={() => setShowQuiz(false)}
        />
      )}
    </div>
  );
}
