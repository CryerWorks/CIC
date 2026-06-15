/**
 * QuizPanel — Full quiz experience: generate, answer, reveal, self-rate, summary, spawn cards.
 *
 * Consumes the `useQuiz()` hook exclusively — never imports QuizGenerator directly (Constitution IV).
 */
import { useCallback, useState } from "react";
import { useQuiz } from "../../ai/features/quiz/hooks/useQuiz";
import { QuestionCard } from "./QuestionCard";
import { AnswerReveal } from "./AnswerReveal";
import { QuizSummary } from "./QuizSummary";

interface QuizPanelProps {
  /** The topic to generate quiz questions about */
  topic: string;
  /** Optional course ID for session persistence and card spawning */
  courseId?: string;
  /** Number of questions to generate (default 5) */
  count?: number;
  /** Called when the user closes the quiz */
  onClose: () => void;
}

export function QuizPanel({ topic, courseId, count = 5, onClose }: QuizPanelProps) {
  const {
    questions,
    currentIndex,
    ratings,
    learnerAnswers,
    status,
    error,
    spawnResults,
    generate,
    submitAnswer,
    submitRating,
    spawnCards,
    reset,
  } = useQuiz();

  const [spawning, setSpawning] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Auto-generate on mount (when status is idle)
  const handleStart = useCallback(() => {
    void generate(topic, { courseId, count });
  }, [topic, courseId, count, generate]);

  const handleSubmitAnswer = useCallback(
    (text: string) => {
      submitAnswer(text);
    },
    [submitAnswer],
  );

  const handleRate = useCallback(
    (rating: "got-it" | "close" | "missed") => {
      void submitRating(rating);
    },
    [submitRating],
  );

  const handleSpawnCards = useCallback(async () => {
    setSpawning(true);
    try {
      await spawnCards();
    } finally {
      setSpawning(false);
    }
  }, [spawnCards]);

  const handleClose = useCallback(() => {
    if (questions.length > 0 && status !== "summary") {
      setShowCloseConfirm(true);
    } else {
      reset();
      onClose();
    }
  }, [questions.length, status, reset, onClose]);

  const confirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    reset();
    onClose();
  }, [reset, onClose]);

  const cancelClose = useCallback(() => {
    setShowCloseConfirm(false);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex h-[500px] w-[480px] flex-col rounded-lg border border-line bg-panel shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Retrieval Quiz</h2>
          <button
            onClick={handleClose}
            className="rounded-sm px-2 py-1 text-xs text-text-dim hover:bg-panel-raised hover:text-text transition-colors"
            aria-label="Close quiz"
          >
            Close
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Idle state — show start button */}
          {status === "idle" && (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <p className="text-center text-sm text-text-dim">
                Generate a retrieval practice quiz on <strong>{topic}</strong> to test your understanding.
              </p>
              <button
                onClick={handleStart}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dim"
              >
                Start Quiz
              </button>
            </div>
          )}

          {/* Generating state */}
          {status === "generating" && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="inline-block size-6 animate-spin rounded-full border-2 border-ai border-t-transparent" />
              <p className="text-sm text-text-dim">Generating quiz questions…</p>
            </div>
          )}

          {/* Answering state — show current question */}
          {status === "answering" && questions[currentIndex] && (
            <QuestionCard
              question={questions[currentIndex]}
              index={currentIndex}
              total={questions.length}
              onSubmit={handleSubmitAnswer}
            />
          )}

          {/* Revealing state — show answer comparison */}
          {status === "revealing" && questions[currentIndex] && (
            <AnswerReveal
              question={questions[currentIndex]}
              learnerAnswer={learnerAnswers.get(currentIndex) ?? ""}
              index={currentIndex}
              total={questions.length}
              onRate={handleRate}
            />
          )}

          {/* Summary state */}
          {status === "summary" && (
            <QuizSummary
              questions={questions}
              ratings={ratings}
              learnerAnswers={learnerAnswers}
              spawnResults={spawnResults}
              onSpawnCards={handleSpawnCards}
              onReset={() => {
                reset();
                // Auto-regenerate with a micro-delay to allow reset to settle
                setTimeout(() => handleStart(), 0);
              }}
              spawning={spawning}
            />
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-sm text-danger">{error ?? "An error occurred generating the quiz."}</p>
              <button
                onClick={handleStart}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dim"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Close confirmation dialog */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
          <div
            className="rounded-lg border border-line bg-panel p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Close confirmation"
          >
            <h3 className="mb-2 text-sm font-semibold text-text">Close Quiz?</h3>
            <p className="mb-4 text-sm text-text-dim">
              You have an in-progress quiz. Closing now will lose your progress.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelClose}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-line-bright bg-panel-raised px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-panel-header"
              >
                Cancel
              </button>
              <button
                onClick={confirmClose}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
              >
                Close anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
