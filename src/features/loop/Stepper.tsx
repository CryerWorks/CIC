import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui";

export interface Step {
  key: string;
  title: string;
  /** A manual/AI-placeholder step that can be passed without input (FR-005). */
  optional?: boolean;
  /** When false, Next is disabled (e.g. the objective is empty). Defaults to true. */
  canAdvance?: boolean;
  content: ReactNode;
}

/** The guided-flow chrome (contracts/ui-loop.md): an ordered step rail, Back/Next/Skip, and a
 *  Cancel that abandons the session (persists nothing). Focus moves to the step heading on change
 *  for keyboard/screen-reader users. The last step (Finish) owns its own action in its content. */
export function Stepper({ steps, onCancel }: { steps: Step[]; onCancel: () => void }) {
  const [i, setI] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [i]);

  const step = steps[i];
  const atFirst = i === 0;
  const atLast = i === steps.length - 1;
  const canAdvance = step.canAdvance ?? true;

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap gap-2 text-xs">
        {steps.map((s, idx) => (
          <li
            key={s.key}
            aria-current={idx === i ? "step" : undefined}
            className={
              idx === i
                ? "rounded-sm bg-brand/20 px-2 py-1 font-medium text-text"
                : idx < i
                  ? "px-2 py-1 text-text-dim"
                  : "px-2 py-1 text-text-faint"
            }
          >
            {idx + 1}. {s.title}
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-3">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-text outline-none">
          {step.title}
        </h2>
        {step.content}
      </section>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Button variant="secondary" size="sm" disabled={atFirst} onClick={() => setI((n) => n - 1)}>
          Back
        </Button>
        {!atLast && (
          <Button size="sm" disabled={!canAdvance} onClick={() => setI((n) => n + 1)}>
            Next
          </Button>
        )}
        {!atLast && step.optional && (
          <Button variant="ghost" size="sm" onClick={() => setI((n) => n + 1)}>
            Skip
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
