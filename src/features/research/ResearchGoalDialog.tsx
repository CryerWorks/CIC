/**
 * ResearchGoalDialog — "What do you want to learn?" dialog for the AI Research Agent.
 *
 * Collects the research topic and optional description, then passes a
 * ResearchGoal to the parent component.
 */

import { useId, useState, type FormEvent } from "react";
import { Button } from "../../components/ui";

interface Props {
  /** Called when the user submits a research goal. */
  onSubmit: (topic: string, description?: string) => void;
  /** Called to close/dismiss the dialog. */
  onClose: () => void;
  /** Privacy consent prompt. Shown if privacy has not been consented. */
  showPrivacyConsent?: boolean;
  /** Called when privacy consent is granted. */
  onPrivacyConsent?: () => void;
}

export function ResearchGoalDialog({
  onSubmit,
  onClose,
  showPrivacyConsent = false,
  onPrivacyConsent,
}: Props) {
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [step, setStep] = useState<"privacy" | "goal">(
    showPrivacyConsent ? "privacy" : "goal",
  );

  const topicId = useId();
  const descId = useId();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    onSubmit(topic.trim(), description.trim() || undefined);
  };

  if (step === "privacy") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div
          className="mx-4 flex w-full max-w-md flex-col rounded-lg border border-line bg-panel p-6 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Privacy consent"
        >
          <h2 className="mb-2 text-sm font-semibold text-text">Privacy Consent</h2>
          <p className="mb-4 text-sm text-text-dim">
            The AI Research Agent searches the web and uses AI to analyze learning materials.
            Your vault content is never sent to external services without your explicit consent.
            Web searches are performed through a local SearXNG instance or through URLs you provide.
          </p>
          <p className="mb-4 text-xs text-text-dim">
            By continuing, you consent to:
          </p>
          <ul className="mb-4 list-inside list-disc text-xs text-text-dim">
            <li>Web searches for learning materials on your research topic</li>
            <li>AI processing of your research goal and profile to generate courses</li>
            <li>No vault content is sent during web search (vault content is only used in AI prompts)</li>
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onPrivacyConsent?.();
                setStep("goal");
              }}
            >
              I Consent
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="mx-4 flex w-full max-w-md flex-col rounded-lg border border-line bg-panel shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Research goal"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-text">What do you want to learn?</h2>
          <button
            onClick={onClose}
            className="rounded-sm px-2 py-1 text-xs text-text-dim hover:bg-surface-sunken hover:text-text"
          >
            Close
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={topicId} className="text-sm font-semibold text-text">
              Research topic
            </label>
            <input
              id={topicId}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Reinforcement Learning, Guitar, Data Structures"
              className="rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={descId} className="text-sm font-semibold text-text">
              Additional context <span className="text-text-dim">(optional)</span>
            </label>
            <textarea
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any specific aspects you want to focus on? What's your motivation?"
              className="rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan min-h-[60px] resize-y"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!topic.trim()}>
              Start Research
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
