/**
 * AnswerReveal — Shows the AI's reference answer alongside the learner's answer,
 * then displays the AI evaluation (score badge + gap explanation).
 * No self-rating buttons — evaluation is AI-driven (Constitution III).
 */
import type { QuizQuestion, AnswerEvaluation } from "../../ai/features/quiz/types";

interface AnswerRevealProps {
  question: QuizQuestion;
  learnerAnswer: string;
  evaluation: AnswerEvaluation;
  index: number;
  total: number;
  onNext: () => void;
}

const scoreConfig: Record<string, { label: string; colorClass: string }> = {
  correct: { label: "Correct", colorClass: "border-success/30 bg-success/10 text-success" },
  partial: { label: "Partial", colorClass: "border-warn/30 bg-warn/10 text-warn" },
  missed: { label: "Missed", colorClass: "border-danger/30 bg-danger/10 text-danger" },
};

export function AnswerReveal({ question, learnerAnswer, evaluation, index, total, onNext }: AnswerRevealProps) {
  const isLast = index === total - 1;
  const config = scoreConfig[evaluation.score] ?? scoreConfig.missed;

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

      {/* AI Evaluation */}
      <div className={`rounded-md border ${config.colorClass} p-3`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide">
            {config.label}
          </span>
        </div>
        {evaluation.explanation && (
          <p className="mt-1.5 text-xs leading-relaxed opacity-80">
            {evaluation.explanation}
          </p>
        )}
      </div>

      {/* Next / Finish button */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {isLast ? "See Results" : "Next Question"}
        </button>
      </div>
    </div>
  );
}
