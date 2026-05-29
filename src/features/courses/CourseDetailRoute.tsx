import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Panel, Button, Callout, Tag } from "../../components/ui";
import { useVaultState } from "../../app/providers/VaultProvider";
import { useCourseCards, type CardInput } from "./useCourseCards";
import { useCoursePlans } from "./useCoursePlans";
import { SessionPlanner } from "./SessionPlanner";
import { CardForm } from "./CardForm";
import { CardCitations } from "./CardCitations";
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
        <Link to="/courses" className="text-sm text-text-dim hover:text-text">
          ← Courses
        </Link>
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
    </div>
  );
}

/** The Course's planned Daily-Loop sessions (Feature 012, US1): establish a session here, then do
 *  it from the Daily Loop. Planning persists only to SQLite — no vault note, no review card. */
function CourseSessions({ courseId }: { courseId: string }) {
  const { loading, planned, resources, milestones, plan, removePlan } = useCoursePlans(courseId);
  const [planning, setPlanning] = useState(false);

  if (loading) return null;

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-dim">Sessions ({planned.length})</h2>
        {!planning && <Button onClick={() => setPlanning(true)}>Plan a session</Button>}
      </div>

      {planning && (
        <Panel title="Plan a session" className="mb-4">
          <SessionPlanner
            resources={resources}
            milestones={milestones}
            onSubmit={async (input) => {
              await plan(input);
              setPlanning(false);
            }}
            onCancel={() => setPlanning(false)}
          />
        </Panel>
      )}

      {planned.length === 0 && !planning ? (
        <Panel>
          <div className="py-6 text-center">
            <p className="text-text">No sessions planned.</p>
            <p className="mt-1 text-sm text-text-dim">Plan a session, then do it from the Daily Loop.</p>
          </div>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-2">
          {planned.map((s) => (
            <li key={s.id}>
              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-text">{s.objective ?? "(no objective)"}</p>
                    <p className="truncate text-xs text-text-dim">
                      Planned {s.date.slice(0, 10)} · do it from the Daily Loop
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Tag tone="neutral">planned</Tag>
                    <Button size="sm" variant="ghost" onClick={() => void removePlan(s.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
