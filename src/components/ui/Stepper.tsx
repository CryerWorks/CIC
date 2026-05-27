import { cx, type StepState } from "./types";

export interface Step {
  label: string;
  state: StepState;
}

interface StepperProps {
  steps: Step[];
  className?: string;
}

const stateCls: Record<StepState, string> = {
  done: "border-brand text-text",
  active: "border-brand bg-brand-soft text-text",
  todo: "border-line text-text-dim",
};

export function Stepper({ steps, className }: StepperProps) {
  return (
    <ol className={cx("flex flex-wrap gap-2", className)}>
      {steps.map((s, i) => (
        <li key={i} className={cx("min-w-20 flex-1 rounded-md border bg-panel px-2.5 py-2 text-xs", stateCls[s.state])}>
          <div className="font-bold leading-none text-text-dim">{i + 1}</div>
          <div className="mt-1">{s.label}</div>
        </li>
      ))}
    </ol>
  );
}
