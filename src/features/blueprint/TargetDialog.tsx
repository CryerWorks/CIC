/**
 * TargetDialog — Target-setting dialog for the Course Generation Engine.
 *
 * Collects scope, depth, topic, and optionally resource IDs for Mode B.
 * The user selects between Mode A (Design with AI) and Mode B (Generate from Resources)
 * at the top level, then fills in the target form.
 */

import { useState, useId, type FormEvent } from "react";
import { Button, Callout } from "../../components/ui";
import type { BlueprintTarget, GenerationMode } from "../../ai/features/blueprint/types";

interface Resource {
  id: string;
  title: string;
}

interface Props {
  /** Whether the vault/db are ready. */
  ready: boolean;
  /** Resources available for Mode B generation. */
  resources: Resource[];
  /** Called with mode + target when the user starts generation. */
  onStart: (mode: GenerationMode, target: BlueprintTarget) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

const fieldCx =
  "rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";

export function TargetDialog({ ready, resources, onStart, onCancel }: Props) {
  const [mode, setMode] = useState<GenerationMode>("a");
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState<"overview" | "working" | "mastery">("working");
  const [domainName, setDomainName] = useState("");
  const [currentLevel, setCurrentLevel] = useState("");
  const [timeBudget, setTimeBudget] = useState("");
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const topicId = useId();
  const domainId = useId();
  const levelId = useId();
  const budgetId = useId();
  const errorId = useId();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!topic.trim()) {
      setError("Topic is required");
      return;
    }

    if (mode === "b" && resources.length > 0 && selectedResources.length === 0) {
      setError("Select at least one resource for Mode B, or switch to Design with AI");
      return;
    }

    setBusy(true);

    const target: BlueprintTarget = {
      topic: topic.trim(),
      scope: "course",
      depth,
      domainName: domainName.trim() || undefined,
      currentLevel: currentLevel.trim() || undefined,
      timeBudget: timeBudget.trim() || undefined,
      resourceIds: mode === "b" && selectedResources.length > 0 ? selectedResources : undefined,
    };

    onStart(mode, target);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg border border-line bg-panel shadow-xl">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-text">New Course</h2>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4" noValidate>
          {/* Mode selection */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-semibold text-text">Generation Mode</legend>
            <div className="flex flex-wrap items-center gap-4 text-sm text-text">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "a"}
                  onChange={() => setMode("a")}
                />
                <span>Design with AI (guided conversation)</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "b"}
                  onChange={() => setMode("b")}
                  disabled={resources.length === 0}
                />
                <span>Generate from Resources</span>
              </label>
            </div>
            {mode === "b" && resources.length === 0 && (
              <p className="text-xs text-text-dim">
                Ingest resources first to use this mode.
              </p>
            )}
          </fieldset>

          {/* Topic */}
          <div className="flex flex-col gap-1">
            <label htmlFor={topicId} className="text-sm font-semibold text-text">
              Topic
            </label>
            <input
              id={topicId}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Real Analysis, Linear Algebra, JavaScript"
              className={fieldCx}
              disabled={!ready}
            />
          </div>

          {/* Depth */}
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-semibold text-text">Depth</legend>
            <div className="flex flex-wrap items-center gap-4 text-sm text-text">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="depth"
                  checked={depth === "overview"}
                  onChange={() => setDepth("overview")}
                />
                Overview
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="depth"
                  checked={depth === "working"}
                  onChange={() => setDepth("working")}
                />
                Working Knowledge
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="depth"
                  checked={depth === "mastery"}
                  onChange={() => setDepth("mastery")}
                />
                Mastery
              </label>
            </div>
          </fieldset>

          {/* Domain (optional) */}
          <div className="flex flex-col gap-1">
            <label htmlFor={domainId} className="text-sm font-semibold text-text">
              Domain (optional)
            </label>
            <input
              id={domainId}
              value={domainName}
              onChange={(e) => setDomainName(e.target.value)}
              placeholder="e.g., Mathematics, Programming"
              className={fieldCx}
            />
          </div>

          {/* Current level (optional) */}
          <div className="flex flex-col gap-1">
            <label htmlFor={levelId} className="text-sm font-semibold text-text">
              Current Level (optional)
            </label>
            <textarea
              id={levelId}
              value={currentLevel}
              onChange={(e) => setCurrentLevel(e.target.value)}
              placeholder="What do you already know about this topic?"
              rows={2}
              className={fieldCx}
            />
          </div>

          {/* Time budget (optional) */}
          <div className="flex flex-col gap-1">
            <label htmlFor={budgetId} className="text-sm font-semibold text-text">
              Time Budget (optional)
            </label>
            <input
              id={budgetId}
              value={timeBudget}
              onChange={(e) => setTimeBudget(e.target.value)}
              placeholder="e.g., 5 hours per week"
              className={fieldCx}
            />
          </div>

          {/* Resource selection (Mode B only) */}
          {mode === "b" && resources.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-semibold text-text">
                Select Resources
              </legend>
              <div className="max-h-32 overflow-y-auto rounded-sm border border-line-bright bg-surface-sunken p-2">
                {resources.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 py-1 text-sm text-text"
                  >
                    <input
                      type="checkbox"
                      checked={selectedResources.includes(r.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedResources((prev) => [...prev, r.id]);
                        } else {
                          setSelectedResources((prev) => prev.filter((id) => id !== r.id));
                        }
                      }}
                    />
                    {r.title}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Error */}
          {error && (
            <p id={errorId} role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          {!ready && (
            <Callout variant="warn" title="Vault not ready">
              Connect a vault and ensure the database is ready before generating a course.
            </Callout>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !ready}>
              {mode === "a" ? "Start Designing" : "Generate from Resources"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
