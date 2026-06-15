/**
 * BlueprintReview — editable review of a CourseBlueprint before materialization.
 *
 * Displays the blueprint as a structured form with editable fields:
 * - Title, domain
 * - Milestone list (editable capabilities)
 * - Card seeds (read-only for v1)
 * - Retrieval questions (read-only)
 * - Feynman targets (read-only)
 * - Materialize button with confirmation
 */

import { useState, useId, type FormEvent } from "react";
import { Panel, Button, Tag } from "../../components/ui";
import type { CourseBlueprint } from "../../ai/features/blueprint/types";
import type { MaterializeCourseResult } from "../../ai/features/blueprint/materializer";

interface Props {
  blueprint: CourseBlueprint;
  materializing: boolean;
  onUpdate: (update: Partial<CourseBlueprint>) => void;
  onMaterialize: () => void;
  onBack: () => void;
  result: MaterializeCourseResult | null;
}

const fieldCx =
  "rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand w-full";

export function BlueprintReview({
  blueprint,
  materializing,
  onUpdate,
  onMaterialize,
  onBack,
  result,
}: Props) {
  const [title, setTitle] = useState(blueprint.title);
  const [domain, setDomain] = useState(blueprint.domain);
  const [showConfirm, setShowConfirm] = useState(false);
  const titleId = useId();

  const depthLabel =
    blueprint.target.depth === "overview"
      ? "Overview"
      : blueprint.target.depth === "working"
        ? "Working Knowledge"
        : "Mastery";

  const handleSaveTitle = () => {
    if (title.trim() && title.trim() !== blueprint.title) {
      onUpdate({ title: title.trim() });
    }
    if (domain.trim() && domain.trim() !== blueprint.domain) {
      onUpdate({ domain: domain.trim() });
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSaveTitle();
    setShowConfirm(true);
  };

  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <Panel>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="text-3xl">✓</div>
            <h3 className="text-lg font-bold text-text">Course Created!</h3>
            <p className="text-sm text-text-dim">
              <strong>{blueprint.title}</strong> has been materialized.
            </p>
            <div className="flex flex-col gap-1 text-sm text-text-dim">
              <span>Course ID: {result.courseId}</span>
              <span>MOC: {result.mocPath}</span>
              <span>Milestones: {result.milestoneCount}</span>
              <span>Suggested cards: {result.cardCount}</span>
            </div>
            <Button onClick={onBack}>Done</Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-text">Review Course Blueprint</h2>
        <div className="flex items-center gap-2">
          <Tag tone="brand">{depthLabel}</Tag>
          <Tag tone="neutral">{blueprint.milestones.length} milestones</Tag>
          <Tag tone="neutral">{blueprint.cardSeeds.length} cards</Tag>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Title + Domain */}
        <Panel title="Course Info">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={titleId} className="text-sm font-semibold text-text">
                Title
              </label>
              <input
                id={titleId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleSaveTitle}
                className={fieldCx}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="bp-domain" className="text-sm font-semibold text-text">Domain</label>
              <input
                id="bp-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onBlur={handleSaveTitle}
                className={fieldCx}
              />
            </div>
            <div className="text-xs text-text-dim">
              Topic: {blueprint.target.topic} &middot; Depth: {depthLabel}
              {blueprint.target.currentLevel && (
                <> &middot; Current level: {blueprint.target.currentLevel}</>
              )}
              {blueprint.target.timeBudget && (
                <> &middot; Budget: {blueprint.target.timeBudget}</>
              )}
            </div>
          </div>
        </Panel>

        {/* Milestones */}
        <Panel title="Milestones">
          <div className="flex flex-col gap-3">
            {blueprint.milestones.map((ms, i) => (
              <div
                key={i}
                className="rounded-sm border border-line-bright bg-surface-sunken p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 text-xs font-bold text-text-dim">
                    {i + 1}.
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text">
                      {ms.capability}
                    </p>
                    <p className="mt-0.5 text-xs text-text-dim">{ms.description}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: ms.difficulty }, (_, j) => (
                      <span
                        key={j}
                        className="inline-block h-2 w-2 rounded-full bg-brand"
                        title={`Difficulty ${ms.difficulty}/5`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Card Seeds */}
        {blueprint.cardSeeds.length > 0 && (
          <Panel title="Suggested Cards (front only — scaffold mode)">
            <div className="flex flex-col gap-2">
              {blueprint.cardSeeds.map((cs, i) => (
                <div
                  key={i}
                  className="rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text"
                >
                  <span className="text-xs text-text-dim">
                    Milestone {cs.milestoneIndex + 1}:
                  </span>{" "}
                  {cs.front}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Retrieval Qs */}
        {blueprint.retrievalQs.length > 0 && (
          <Panel title="Retrieval Questions">
            <div className="flex flex-col gap-2">
              {blueprint.retrievalQs.map((q, i) => (
                <div
                  key={i}
                  className="rounded-sm border border-line-bright bg-surface-sunken px-3 py-2"
                >
                  <p className="text-sm font-medium text-text">{q.question}</p>
                  <p className="mt-0.5 text-xs text-text-dim">{q.answerSnippet}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Feynman Targets */}
        {blueprint.feynmanTargets.length > 0 && (
          <Panel title="Feynman Technique Targets">
            <div className="flex flex-wrap gap-2">
              {blueprint.feynmanTargets.map((ft, i) => (
                <Tag key={i} tone="success">
                  {ft.concept}
                </Tag>
              ))}
            </div>
          </Panel>
        )}

        {/* Resource Map */}
        {blueprint.resourceMap.length > 0 && (
          <Panel title="Resource Map">
            <div className="flex flex-col gap-2 text-sm text-text">
              {blueprint.resourceMap.map((rm, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-sm border border-line-bright bg-surface-sunken px-3 py-2"
                >
                  <span className="font-medium">{rm.resourceId}</span>
                  <Tag tone="neutral">{rm.role ?? "reference"}</Tag>
                  <span className="text-text-dim">
                    → Milestone {rm.milestoneIndex + 1}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={materializing}>
            {materializing ? "Materializing…" : "Materialize Course"}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </form>

      {/* Materialize confirmation dialog */}
      {showConfirm && !result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="rounded-lg border border-line bg-panel p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Materialize confirmation"
          >
            <h3 className="mb-2 text-sm font-semibold text-text">Materialize Course?</h3>
            <p className="mb-4 text-sm text-text-dim">
              This will create the course <strong>{title}</strong> in domain{" "}
              <strong>{domain}</strong>, write its MOC to the vault, and create{" "}
              {blueprint.cardSeeds.length} suggested cards (front only).
            </p>
            <p className="mb-4 text-xs text-text-dim">
              This action requires explicit approval — the AI never auto-commits.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  onMaterialize();
                }}
              >
                Materialize
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
