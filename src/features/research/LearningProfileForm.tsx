/**
 * LearningProfileForm — self-assessment form for the AI Research Agent.
 *
 * Collects the learner's domain, current level, knowledge description,
 * time budget, and depth goal. Used to calibrate course generation.
 */

import { useId, useState, type FormEvent } from "react";
import { Button, Panel } from "../../components/ui";
import type { LearningProfile } from "../../ai/features/research/types";

interface Props {
  /** Initial values (for editing an existing profile). */
  initial?: Partial<LearningProfile>;
  /** Called when the form is submitted. */
  onSubmit: (profile: LearningProfile) => void;
  /** Called to skip the profile step. */
  onSkip?: () => void;
}

const inputCx =
  "rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan w-full";
const labelCx = "text-sm font-semibold text-text";
const selectCx = inputCx + " appearance-none";

export function LearningProfileForm({ initial, onSubmit, onSkip }: Props) {
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [declaredLevel, setDeclaredLevel] = useState<LearningProfile["declaredLevel"]>(
    initial?.declaredLevel ?? "beginner",
  );
  const [knowledgeText, setKnowledgeText] = useState(initial?.knowledgeText ?? "");
  const [timeBudget, setTimeBudget] = useState(initial?.timeBudget ?? "");
  const [depthGoal, setDepthGoal] = useState<LearningProfile["depthGoal"]>(
    initial?.depthGoal ?? "working",
  );

  const domainId = useId();
  const levelId = useId();
  const knowledgeId = useId();
  const budgetId = useId();
  const depthId = useId();

  const isValid = domain.trim().length > 0 && knowledgeText.trim().length > 0 && timeBudget.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({
      domain: domain.trim(),
      declaredLevel,
      knowledgeText: knowledgeText.trim(),
      timeBudget: timeBudget.trim(),
      depthGoal,
    });
  };

  return (
    <Panel title="Learning Profile">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-xs text-text-dim">
          Tell us about your current knowledge and goals so the generated courses are calibrated to you.
        </p>

        {/* Domain */}
        <div className="flex flex-col gap-1">
          <label htmlFor={domainId} className={labelCx}>
            What domain / subject area?
          </label>
          <input
            id={domainId}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. Quantum Mechanics, Machine Learning, Baroque Music"
            className={inputCx}
            required
          />
        </div>

        {/* Declared Level */}
        <div className="flex flex-col gap-1">
          <label htmlFor={levelId} className={labelCx}>
            Your current level
          </label>
          <select
            id={levelId}
            value={declaredLevel}
            onChange={(e) => setDeclaredLevel(e.target.value as LearningProfile["declaredLevel"])}
            className={selectCx}
          >
            <option value="beginner">Beginner — new to the subject</option>
            <option value="intermediate">Intermediate — some familiarity</option>
            <option value="advanced">Advanced — solid foundation, want depth</option>
          </select>
        </div>

        {/* Knowledge Description */}
        <div className="flex flex-col gap-1">
          <label htmlFor={knowledgeId} className={labelCx}>
            What do you already know?
          </label>
          <textarea
            id={knowledgeId}
            value={knowledgeText}
            onChange={(e) => setKnowledgeText(e.target.value)}
            placeholder="Describe your current knowledge, relevant experience, or what you've studied before…"
            className={inputCx + " min-h-[80px] resize-y"}
            rows={3}
            required
          />
        </div>

        {/* Time Budget */}
        <div className="flex flex-col gap-1">
          <label htmlFor={budgetId} className={labelCx}>
            Time budget
          </label>
          <input
            id={budgetId}
            value={timeBudget}
            onChange={(e) => setTimeBudget(e.target.value)}
            placeholder="e.g. 5 hours/week for 2 months"
            className={inputCx}
            required
          />
        </div>

        {/* Depth Goal */}
        <div className="flex flex-col gap-1">
          <label htmlFor={depthId} className={labelCx}>
            Desired depth
          </label>
          <select
            id={depthId}
            value={depthGoal}
            onChange={(e) => setDepthGoal(e.target.value as LearningProfile["depthGoal"])}
            className={selectCx}
          >
            <option value="overview">Overview — big picture understanding</option>
            <option value="working">Working Knowledge — practical competence</option>
            <option value="mastery">Mastery — deep expertise</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={!isValid}>
            Continue
          </Button>
          {onSkip && (
            <Button type="button" variant="ghost" onClick={onSkip}>
              Skip — use defaults
            </Button>
          )}
        </div>
      </form>
    </Panel>
  );
}
