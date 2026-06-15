/**
 * QuestionCard — A single quiz question with a text input for the learner's answer.
 */
import { useState, type FormEvent } from "react";
import type { QuizQuestion } from "../../ai/features/quiz/types";

interface QuestionCardProps {
  question: QuizQuestion;
  index: number;
  total: number;
  onSubmit: (answer: string) => void;
}

export function QuestionCard({ question, index, total, onSubmit }: QuestionCardProps) {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || submitted) return;
    setSubmitted(true);
    onSubmit(answer.trim());
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Progress indicator */}
      <div className="flex items-center justify-between text-xs text-text-dim">
        <span>
          Question {index + 1} of {total}
        </span>
        <span className="rounded-sm bg-panel-raised px-2 py-0.5">
          {Math.round(((index + 1) / total) * 100)}%
        </span>
      </div>

      {/* Question text */}
      <div className="rounded-md border border-line bg-panel-header p-4">
        <p className="text-sm leading-relaxed text-text">{question.question}</p>
      </div>

      {/* Answer input */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="quiz-answer" className="text-xs font-medium text-text-dim">
          Your answer:
        </label>
        <textarea
          id="quiz-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer here…"
          disabled={submitted}
          rows={4}
          className="w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!answer.trim() || submitted}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitted ? "Submitted" : "Submit Answer"}
          </button>
        </div>
      </form>
    </div>
  );
}
