/**
 * CampaignReview — review the generated research campaign before materialization.
 *
 * Shows the campaign title, all courses with their milestones, card seeds,
 * retrieval questions, and Feynman targets. User can approve materialization
 * or go back.
 */

import { useState } from "react";
import { Button, Panel, Tag } from "../../components/ui";
import type { ResearchResult, ResearchCourse } from "../../ai/features/research/types";
import type { MaterializeCourseResult } from "../../ai/features/blueprint/materializer";

interface Props {
  /** The research result with courses to review. */
  result: ResearchResult;
  /** Whether materialization is in progress. */
  materializing: boolean;
  /** Called when user approves materialization. */
  onMaterialize: () => void;
  /** Called to go back and start a new research. */
  onBack: () => void;
  /** Results after materialization completes. */
  materializeResults: MaterializeCourseResult[];
}

export function CampaignReview({
  result,
  materializing,
  onMaterialize,
  onBack,
  materializeResults,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);

  const totalCards = result.courses.reduce(
    (sum, c) => sum + c.courseBlueprint.cardSeeds.length,
    0,
  );
  const totalMilestones = result.courses.reduce(
    (sum, c) => sum + c.courseBlueprint.milestones.length,
    0,
  );

  // If all courses have been materialized, show success
  if (materializeResults.length === result.courses.length) {
    return (
      <div className="mx-auto max-w-2xl">
        <Panel>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="text-3xl">✓</div>
            <h3 className="text-lg font-bold text-text">Campaign Created!</h3>
            <p className="text-sm text-text-dim">
              <strong>{result.campaignTitle ?? `Learning ${result.goal.topic}`}</strong> has been materialized.
            </p>
            <div className="flex flex-col gap-1 text-sm text-text-dim">
              <span>{result.courses.length} course(s)</span>
              <span>{totalMilestones} milestone(s)</span>
              <span>{totalCards} suggested card(s)</span>
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
        <div>
          <h2 className="text-lg font-bold text-text">Review Campaign</h2>
          <p className="text-sm text-text-dim">
            {result.campaignTitle ?? `Learning ${result.goal.topic}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tag tone="brand">{result.courses.length} courses</Tag>
          <Tag tone="neutral">{totalMilestones} milestones</Tag>
          <Tag tone="neutral">{totalCards} cards</Tag>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Sources */}
        {result.sources.length > 0 && (
          <Panel title={`Sources (${result.sources.length})`}>
            <div className="flex flex-col gap-2">
              {result.sources.map((s, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-sm border border-line-bright bg-surface-sunken px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-text">{s.title}</p>
                    <p className="truncate text-xs text-text-dim">{s.url}</p>
                  </div>
                  <Tag tone="neutral">{s.sourceType}</Tag>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Courses */}
        {result.courses.map((course, ci) => (
          <CourseReviewCard
            key={ci}
            course={course}
            index={ci}
            materialized={materializeResults[ci] != null}
          />
        ))}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowConfirm(true)} disabled={materializing}>
            {materializing ? "Materializing…" : "Materialize All Courses"}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Start New Research
          </Button>
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="rounded-lg border border-line bg-panel p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Materialize confirmation"
          >
            <h3 className="mb-2 text-sm font-semibold text-text">Materialize Campaign?</h3>
            <p className="mb-4 text-sm text-text-dim">
              This will create <strong>{result.courses.length} course(s)</strong> with{" "}
              <strong>{totalMilestones} milestone(s)</strong> and{" "}
              <strong>{totalCards} suggested card(s)</strong>.
            </p>
            <p className="mb-4 text-xs text-text-dim">
              Each course will be written to your vault as a MOC (Map of Content) document.
              Cards are scaffold-only (fronts only). This action requires explicit approval.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button
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

/** Individual course card in the review. */
function CourseReviewCard({
  course,
  index,
  materialized,
}: {
  course: ResearchCourse;
  index: number;
  materialized: boolean;
}) {
  const bp = course.courseBlueprint;

  return (
    <Panel title={`${index + 1}. ${course.title}`}>
      <div className="flex flex-col gap-3">
        {/* Course metadata */}
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <Tag tone="neutral">{course.domain}</Tag>
          <Tag tone={materialized ? "success" : "neutral"}>
            {materialized ? "✓ Materialized" : "Pending"}
          </Tag>
          <span>{bp.milestones.length} milestones</span>
          <span>{bp.cardSeeds.length} cards</span>
        </div>

        {/* Milestones */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase text-text-dim">Milestones</h4>
          {bp.milestones.map((ms, i) => (
            <div
              key={i}
              className="rounded-sm border border-line-bright bg-surface-sunken p-2"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-xs font-bold text-text-dim">{i + 1}.</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-text">{ms.capability}</p>
                  <p className="mt-0.5 text-xs text-text-dim">{ms.description}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: ms.difficulty }, (_, j) => (
                    <span
                      key={j}
                      className="inline-block h-1.5 w-1.5 rounded-full bg-cyan"
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Card Seeds (collapsed) */}
        {bp.cardSeeds.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-text-dim hover:text-text">
              {bp.cardSeeds.length} suggested card(s)
            </summary>
            <div className="mt-2 flex flex-col gap-1.5">
              {bp.cardSeeds.map((cs, i) => (
                <div
                  key={i}
                  className="rounded-sm border border-line-bright bg-surface-sunken px-2 py-1.5 text-xs text-text"
                >
                  <span className="text-text-dim">M{cs.milestoneIndex + 1}:</span> {cs.front}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Retrieval Qs (collapsed) */}
        {bp.retrievalQs.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-text-dim hover:text-text">
              {bp.retrievalQs.length} retrieval question(s)
            </summary>
            <div className="mt-2 flex flex-col gap-1.5">
              {bp.retrievalQs.map((q, i) => (
                <div
                  key={i}
                  className="rounded-sm border border-line-bright bg-surface-sunken px-2 py-1.5"
                >
                  <p className="text-xs font-medium text-text">{q.question}</p>
                  <p className="mt-0.5 text-[11px] text-text-dim">{q.answerSnippet}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </Panel>
  );
}
