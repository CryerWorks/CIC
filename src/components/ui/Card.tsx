import { cx } from "./types";

interface CardProps {
  question: string;
  answer?: string;
  hint?: string;
  face?: "front" | "back";
  className?: string;
}

// Flashcard SHELL only — renders the `face` the consumer specifies. No flip-on-click,
// no reveal-before-recall, no timer: recall-gating is a desirable-difficulty mechanism
// owned by the SRS feature later (Constitution III / research R6).
export function Card({ question, answer, hint, face = "front", className }: CardProps) {
  return (
    <div className={cx("rounded-md border border-line bg-panel p-5 text-center", className)}>
      {face === "front" ? (
        <>
          <div className="text-lg font-semibold text-text">{question}</div>
          {hint && <div className="mt-2 text-2xs uppercase tracking-wider text-text-dim">{hint}</div>}
        </>
      ) : (
        <div className="text-lg text-text">{answer}</div>
      )}
    </div>
  );
}
