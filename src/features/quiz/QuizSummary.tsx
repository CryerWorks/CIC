/**
 * QuizSummary — Shows quiz results (AI evaluations per question) and a button
 * to spawn cards from missed items.
 */
import type { QuizQuestion, AnswerEvaluation, SpawnResult } from "../../ai/features/quiz/types";

interface QuizSummaryProps {
  questions: QuizQuestion[];
  evaluations: Map<number, AnswerEvaluation>;
  learnerAnswers: Map<number, string>;
  spawnResults: SpawnResult[] | null;
  onSpawnCards: () => void;
  onReset: () => void;
  spawning?: boolean;
}

const evalLabel: Record<string, string> = {
  correct: "✅ Correct",
  partial: "🟡 Partial",
  missed: "❌ Missed",
};

const evalColor: Record<string, string> = {
  correct: "text-success",
  partial: "text-warn",
  missed: "text-danger",
};

const evalBg: Record<string, string> = {
  correct: "border-success/30 bg-success/10",
  partial: "border-warn/30 bg-warn/10",
  missed: "border-danger/30 bg-danger/10",
};

export function QuizSummary({
  questions,
  evaluations,
  learnerAnswers,
  spawnResults,
  onSpawnCards,
  onReset,
  spawning = false,
}: QuizSummaryProps) {
  const missedCount = questions.filter((_, i) => evaluations.get(i)?.score === "missed").length;
  const correctCount = questions.filter((_, i) => evaluations.get(i)?.score === "correct").length;
  const partialCount = questions.filter((_, i) => evaluations.get(i)?.score === "partial").length;
  const allEvaluated = questions.every((_, i) => evaluations.has(i));

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-text">Quiz Complete</h3>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-center">
          <p className="text-lg font-bold text-success">{correctCount}</p>
          <p className="text-xs text-text-dim">Correct</p>
        </div>
        <div className="rounded-md border border-warn/30 bg-warn/10 p-3 text-center">
          <p className="text-lg font-bold text-warn">{partialCount}</p>
          <p className="text-xs text-text-dim">Partial</p>
        </div>
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-center">
          <p className="text-lg font-bold text-danger">{missedCount}</p>
          <p className="text-xs text-text-dim">Missed</p>
        </div>
      </div>

      {/* Detailed results */}
      {allEvaluated && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-text-dim">Details</h4>
          {questions.map((q, i) => {
            const eval_ = evaluations.get(i);
            const answer = learnerAnswers.get(i);
            return (
              <div
                key={i}
                className={`rounded-md border ${evalBg[eval_?.score ?? "missed"]} p-3`}
              >
                <p className="mb-1 text-sm text-text">{q.question}</p>
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-text-dim">
                    Your answer: {answer ? answer : <span className="italic">(empty)</span>}
                  </span>
                  {eval_ && (
                    <>
                      <span className={`font-medium ${evalColor[eval_.score]}`}>
                        {evalLabel[eval_.score]}
                      </span>
                      {eval_.explanation && (
                        <span className="text-text-dim">{eval_.explanation}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Spawn cards from missed items */}
      {allEvaluated && missedCount > 0 && !spawnResults && (
        <button
          onClick={onSpawnCards}
          disabled={spawning}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          {spawning ? "Creating cards…" : `Create cards for ${missedCount} missed`}
        </button>
      )}

      {/* Spawn results */}
      {spawnResults && spawnResults.length > 0 && (
        <div className="rounded-md border border-success/30 bg-success/10 p-3">
          <p className="text-xs font-semibold text-success">
            Created {spawnResults.filter((r) => r.success).length} card
            {spawnResults.filter((r) => r.success).length !== 1 ? "s" : ""}
          </p>
          {spawnResults.some((r) => !r.success) && (
            <p className="mt-1 text-xs text-danger">
              {spawnResults.filter((r) => !r.success).length} failed
            </p>
          )}
        </div>
      )}

      {/* Restart */}
      <button
        onClick={onReset}
        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-line-bright bg-panel-raised px-3.5 py-2 text-sm font-semibold text-text transition-colors hover:bg-panel-header"
      >
        Start a new quiz
      </button>
    </div>
  );
}
