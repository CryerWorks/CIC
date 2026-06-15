/**
 * AnswerReveal — Shows the AI's reference answer alongside the learner's answer,
 * then offers self-rating buttons (Got it / Close / Missed).
 */
import type { QuizQuestion, SelfRating } from "../../ai/features/quiz/types";

interface AnswerRevealProps {
  question: QuizQuestion;
  learnerAnswer: string;
  index: number;
  total: number;
  onRate: (rating: SelfRating) => void;
}

export function AnswerReveal({ question, learnerAnswer, index, total, onRate }: AnswerRevealProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <div className="text-xs text-text-dim">
        Question {index + 1} of {total}
      </div>

      {/* Question review */}
      <div className="rounded-md border border-line bg-panel-header p-4">
        <p className="text-sm leading-relaxed text-text">{question.question}</p>
      </div>

      {/* Answers side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-line bg-surface-sunken p-3">
          <h4 className="mb-1.5 text-xs font-semibold text-text-dim">Your answer</h4>
          <p className="text-sm leading-relaxed text-text">
            {learnerAnswer || <span className="italic text-text-dim">(empty)</span>}
          </p>
        </div>
        <div className="rounded-md border border-line bg-panel-raised p-3">
          <h4 className="mb-1.5 text-xs font-semibold text-ai">Reference answer</h4>
          <p className="text-sm leading-relaxed text-text">{question.answer}</p>
        </div>
      </div>

      {/* Self-rating */}
      <div>
        <p className="mb-2 text-xs font-medium text-text-dim">
          How did you do?
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onRate("got-it")}
            className="flex-1 cursor-pointer rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-xs font-semibold text-success transition-colors hover:bg-success/20"
          >
            ✅ Got it
          </button>
          <button
            onClick={() => onRate("close")}
            className="flex-1 cursor-pointer rounded-sm border border-warn/30 bg-warn/10 px-3 py-2 text-xs font-semibold text-warn transition-colors hover:bg-warn/20"
          >
            🟡 Close
          </button>
          <button
            onClick={() => onRate("missed")}
            className="flex-1 cursor-pointer rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition-colors hover:bg-danger/20"
          >
            ❌ Missed
          </button>
        </div>
      </div>
    </div>
  );
}
