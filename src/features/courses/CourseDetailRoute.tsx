import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Panel, Button, Callout, Tag } from "../../components/ui";
import { useVaultState } from "../../app/providers/VaultProvider";
import { useCourseCards, type CardInput } from "./useCourseCards";
import { useCoursePlans } from "./useCoursePlans";
import { SessionPlanner } from "./SessionPlanner";
import { CardForm } from "./CardForm";
import { CardCitations } from "./CardCitations";
import { ProjectsSection } from "../projects/ProjectsSection";
import { FeynmanPanel } from "../feynman/FeynmanPanel";
import { QuizPanel } from "../quiz/QuizPanel";
import type { Card } from "../../db";

/** A Course's detail screen (Feature 010, US2): its cards, plus authoring. Gated on a connected
 *  vault like the rest of the Courses surface. */
export function CourseDetailRoute() {
  const vault = useVaultState();
  const { courseId } = useParams();

  if (vault.status === "checking") return <p className="text-text-dim">Loading…</p>;
  if (vault.status !== "ready") {
    return (
      <div className="mx-auto max-w-2xl">
        <Callout variant="info" title="Connect a vault first">
          <span>
            <Link to="/vault" className="font-medium text-brand underline">
              Choose your vault
            </Link>{" "}
            to manage cards.
          </span>
        </Callout>
      </div>
    );
  }
  if (!courseId) return <Navigate to="/courses" replace />;
  return <CourseDetailView courseId={courseId} />;
}

type Editor = { mode: "new" } | { mode: "edit"; card: Card };

function CourseDetailView({ courseId }: { courseId: string }) {
  const { loading, course, cards, addCard, editCard, removeCard } = useCourseCards(courseId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showFeynman, setShowFeynman] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);

  if (loading) return <p className="text-text-dim">Loading…</p>;
  if (!course) {
    return (
      <div className="mx-auto max-w-2xl">
        <Callout variant="warn" title="Course not found">
          <Link to="/courses" className="font-medium text-brand underline">
            Back to Courses
          </Link>
        </Callout>
      </div>
    );
  }

  const submit = async (input: CardInput) => {
    if (editor?.mode === "edit") {
      await editCard(editor.card.id, input);
      setEditor(null);
    } else {
      // Citations need a saved card id (card_resources FK), so creating a card keeps the editor open
      // in edit mode on the new card — the citation section then appears for both create and edit.
      const card = await addCard(input);
      setEditor({ mode: "edit", card });
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <Link to="/courses" className="text-sm text-text-dim hover:text-text">
            ← Courses
          </Link>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowQuiz(true)}>
              Quiz this course
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowFeynman(true)}>
              Feynman Tutor
            </Button>
          </div>
        </div>
        <h1 className="mt-1 text-xl font-bold text-text">{course.title}</h1>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-dim">Cards ({cards.length})</h2>
        {editor === null && <Button onClick={() => setEditor({ mode: "new" })}>Add card</Button>}
      </div>

      {editor && (
        <Panel title={editor.mode === "edit" ? "Edit card" : "New card"} className="mb-4">
          <CardForm
            initial={
              editor.mode === "edit"
                ? { front: editor.card.front, back: editor.card.back, notePath: editor.card.note_path }
                : undefined
            }
            submitLabel={editor.mode === "edit" ? "Save card" : "Add card"}
            onSubmit={submit}
            onCancel={() => setEditor(null)}
          />
          {editor.mode === "edit" && <CardCitations card={editor.card} />}
        </Panel>
      )}

      {cards.length === 0 && editor === null ? (
        <Panel>
          <div className="py-8 text-center">
            <p className="text-text">No cards yet.</p>
            <p className="mt-1 text-sm text-text-dim">Add a card and it joins your review queue.</p>
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setEditor({ mode: "new" })}>Add your first card</Button>
            </div>
          </div>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((c) => (
            <li key={c.id}>
              <Panel>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-text">{c.front}</p>
                    <p className="truncate text-sm text-text-dim">{c.back}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.fsrs_state === null && <Tag tone="neutral">new</Tag>}
                    <Button size="sm" variant="secondary" onClick={() => setEditor({ mode: "edit", card: c })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void removeCard(c.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <CourseSessions courseId={courseId} />

      <ProjectsSection courseId={courseId} />

      {showFeynman && (
        <FeynmanPanel
          gapSaveTarget={{
            type: "session-writeup",
            notePath: `Courses/${course.title || courseId}.md`,
            courseId,
          }}
          onClose={() => setShowFeynman(false)}
        />
      )}

      {showQuiz && (
        <QuizPanel
          topic={course.title || courseId}
          courseId={courseId}
          onClose={() => setShowQuiz(false)}
        />
      )}
    </div>
  );
}

/**
 * The Course's curriculum (Feature 012 + 013): the Course's sessions as an ordered, milestone-aware
 * sequence. Plan a session here, sequence it with Move ↑/↓, map it to a Milestone, and watch
 * coverage + progress — then *do* each from the Daily Loop (the order is a guide, not a gate; the
 * loop is untouched). Planning/sequencing/mapping persist only to SQLite — no vault note, no card.
 */
function CourseSessions({ courseId }: { courseId: string }) {
  const { loading, sessions, resources, milestones, projects, coverage, unassignedCount, progress, plan, removePlan, reorder, setMilestone } =
    useCoursePlans(courseId);
  const [planning, setPlanning] = useState(false);

  if (loading) return null;

  // A move ↑/↓ swaps two adjacent ids and rewrites the whole sequence (the repo normalizes 0..N-1).
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sessions.length) return;
    const ids = sessions.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void reorder(ids);
  };

  const milestoneLabel = (id: string | null) =>
    (id && milestones.find((m) => m.id === id)?.capability) || "unassigned";

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-dim">Sessions ({sessions.length})</h2>
        {!planning && <Button onClick={() => setPlanning(true)}>Plan a session</Button>}
      </div>

      {planning && (
        <Panel title="Plan a session" className="mb-4">
          <SessionPlanner
            resources={resources}
            milestones={milestones}
            projects={projects}
            onSubmit={async (input) => {
              await plan(input);
              setPlanning(false);
            }}
            onCancel={() => setPlanning(false)}
          />
        </Panel>
      )}

      {sessions.length === 0 && !planning ? (
        <Panel>
          <div className="py-6 text-center">
            <p className="text-text">No sessions planned.</p>
            <p className="mt-1 text-sm text-text-dim">Plan a session, then do it from the Daily Loop.</p>
          </div>
        </Panel>
      ) : (
        sessions.length > 0 && (
          <>
            {/* Progress (a literal count — no mastery claim) + Milestone coverage. */}
            <p className="mb-2 text-xs font-medium text-text-dim">
              Progress {progress.done} / {progress.total}
            </p>
            {milestones.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
                {coverage.map(({ milestone, count }) => (
                  <span key={milestone.id} className="inline-flex items-center gap-1">
                    {milestone.capability}: {count}
                    {count === 0 && <Tag tone="warn">uncovered</Tag>}
                  </span>
                ))}
                <span>unassigned: {unassignedCount}</span>
              </div>
            )}

            <ol className="flex flex-col gap-2">
              {sessions.map((s, i) => {
                const name = s.objective ?? "(no objective)";
                const completed = s.status === "completed";
                return (
                  <li key={s.id}>
                    <Panel>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <span className="shrink-0 text-sm tabular-nums text-text-dim">{i + 1}.</span>
                          <div className="min-w-0">
                            <p className="truncate text-text">{name}</p>
                            {completed && (
                              <p className="truncate text-xs text-text-dim">{milestoneLabel(s.milestone_id)}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {completed ? (
                            <Tag tone="neutral">done</Tag>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Move up: ${name}`}
                                disabled={i === 0}
                                onClick={() => move(i, -1)}
                              >
                                ↑
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Move down: ${name}`}
                                disabled={i === sessions.length - 1}
                                onClick={() => move(i, 1)}
                              >
                                ↓
                              </Button>
                              {milestones.length > 0 && (
                                <select
                                  aria-label={`Milestone for: ${name}`}
                                  value={s.milestone_id ?? ""}
                                  onChange={(e) => void setMilestone(s.id, e.target.value || null)}
                                  className="rounded-sm border border-line bg-surface-sunken px-2 py-1 text-xs text-text"
                                >
                                  <option value="">— none —</option>
                                  {milestones.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.capability}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <Tag tone="neutral">planned</Tag>
                              <Button size="sm" variant="ghost" onClick={() => void removePlan(s.id)}>
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </Panel>
                  </li>
                );
              })}
            </ol>
          </>
        )
      )}
    </div>
  );
}
