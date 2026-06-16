import { useMemo, useState } from "react";
import type { DailyLoop } from "../useDailyLoop";
import { FIELD } from "./field";
import { FeynmanPanel } from "../../feynman/FeynmanPanel";
import { QuizPanel } from "../../quiz/QuizPanel";
import { Button } from "../../../components/ui";
import type { SessionSource } from "../../../ai/features/feynman/tutor";

/** Step 6 — self-test. Feynman interrogation is AI-driven, Quiz is AI-evaluated.
 *  When session sources are tracked (Feature 023), Feynman is gated on all sources completed:
 *  the auto-launch and manual button are disabled until the learner finishes every source. */
export function SelfTestStep({ loop }: { loop: DailyLoop }) {
  const [showTutor, setShowTutor] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);

  // Build session sources from the loop's assignments for AI-driven Feynman interrogation
  const sessionSources = useMemo<SessionSource[]>(() => {
    return loop.assignments
      .filter((a) => a.resource)
      .map((a) => ({
        url: a.resource?.url ?? "",
        title: a.resource?.title ?? a.resourceId,
        type: (a.kind === "watch" || a.kind === "listen" ? "watching" : "reading") as "reading" | "watching",
        estimatedMinutes: 20,
      }));
  }, [loop.assignments]);

  // Feature 023: When session_sources exist, gate Feynman on all being completed.
  const hasSources = loop.sessionSources.length > 0;
  const feynmanLocked = hasSources && !loop.allSourcesDone;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between">
        <p className="text-text-dim">Explain it in your own words, or quiz yourself. Nothing here is graded.</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowQuiz(true)}>
            Retrieval Quiz
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={feynmanLocked}
            onClick={() => setShowTutor(true)}
            title={feynmanLocked ? "Complete all session sources first" : undefined}
          >
            {feynmanLocked ? "🔒 Feynman Tutor" : "Feynman Tutor"}
          </Button>
        </div>
      </div>

      {feynmanLocked && (
        <p className="text-xs text-text-faint">
          Complete all sources in Active Study to unlock the Feynman Tutor.
        </p>
      )}

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
            courseId: loop.courseId ? loop.courseId : undefined,
          }}
          sessionSources={sessionSources.length > 0 ? sessionSources : undefined}
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
