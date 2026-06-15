/**
 * QuizSummary — Shows quiz results (self-ratings per question) and a button
 * to spawn cards from missed items.
 */
import type { QuizQuestion, SelfRating, SpawnResult } from "../../ai/features/quiz/types";

interface QuizSummaryProps {
  questions: QuizQuestion[];
  ratings: Map<number, SelfRating>;
  learnerAnswers: Map<number, string>;
  spawnResults: SpawnResult[] | null;
  onSpawnCards: () => void;
  onReset: () => void;
  spawning?: boolean;
}

const ratingLabel: Record<SelfRating, string> = {
  "got-it": "✅ Got it",
  close: "🟡 Close",
  missed: "❌ Missed",
};

const ratingColor: Record<SelfRating, string> = {
  "got-it": "text-success",
  close: "text-warn",
  missed: "text-danger",
};

export function QuizSummary({
  questions,
  ratings,
  learnerAnswers,
  spawnResults,
  onSpawnCards,
  onReset,
  spawning = false,
}: QuizSummaryProps) {
  const missedCount = questions.filter((_, i) => ratings.get(i) === "missed").length;
  const gotItCount = questions.filter((_, i) => ratings.get(i) === "got-it").length;
  const closeCount = questions.filter((_, i) => ratings.get(i) === "close").length;
  const allRated = questions.every((_, i) => ratings.has(i));

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-text">Quiz Complete</h3>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-center">
          <p className="text-lg font-bold text-success">{gotItCount}</p>
          <p className="text-xs text-text-dim">Got it</p>
        </div>
        <div className="rounded-md border border-warn/30 bg-warn/10 p-3 text-center">
          <p className="text-lg font-bold text-warn">{closeCount}</p>
          <p className="text-xs text-text-dim">Close</p>
        </div>
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-center">
          <p className="text-lg font-bold text-danger">{missedCount}</p>
          <p className="text-xs text-text-dim">Missed</p>
        </div>
      </div>

      {/* Detailed results */}
      {allRated && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-text-dim">Details</h4>
          {questions.map((q, i) => {
            const rating = ratings.get(i);
            const answer = learnerAnswers.get(i);
            return (
              <div
                key={i}
                className="rounded-md border border-line bg-panel-raised p-3"
              >
                <p className="mb-1 text-sm text-text">{q.question}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-dim">
                    Your answer: {answer ? answer : <span className="italic">(empty)</span>}
                  </span>
                  {rating && (
                    <span className={`font-medium ${ratingColor[rating]}`}>
                      {ratingLabel[rating]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Spawn cards from missed items */}
      {allRated && missedCount > 0 && !spawnResults && (
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
