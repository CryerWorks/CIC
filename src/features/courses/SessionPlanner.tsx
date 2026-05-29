import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui";
import { ASSIGNMENT_KIND, type AssignmentKind, type Resource, type Milestone } from "../../db";
import type { PlanFormInput } from "./useCoursePlans";

const FIELD = "w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-text";
const KIND_LABEL: Record<AssignmentKind, string> = { read: "Read", watch: "Watch", listen: "Listen", review: "Review" };

interface DraftAssignment {
  resourceId: string;
  locator: string;
  kind: AssignmentKind;
}

/**
 * Establish a session (Feature 012, US1): objective (seedable from a Milestone) + the assignments
 * to study + the pretest questions to attempt + the card prompts to make. Saving persists a
 * **planned** session — it writes nothing to the vault and creates no review card. Presentational:
 * the Course-detail screen supplies the active-vault Resources, the Course's Milestones, and the
 * save handler.
 */
export function SessionPlanner({
  resources,
  milestones,
  onSubmit,
  onCancel,
}: {
  resources: Resource[];
  milestones: Milestone[];
  onSubmit: (input: PlanFormInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [objective, setObjective] = useState("");
  const [assignments, setAssignments] = useState<DraftAssignment[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [cards, setCards] = useState<{ front: string; back: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Authoring rows for the three repeatable sections.
  const [aResource, setAResource] = useState("");
  const [aKind, setAKind] = useState<AssignmentKind>("read");
  const [aLocator, setALocator] = useState("");
  const [question, setQuestion] = useState("");
  const [cFront, setCFront] = useState("");
  const [cBack, setCBack] = useState("");

  const addAssignment = () => {
    if (!aResource) return;
    setAssignments((a) => [...a, { resourceId: aResource, locator: aLocator, kind: aKind }]);
    setAResource("");
    setALocator("");
    setAKind("read");
  };
  const addQuestion = () => {
    if (!question.trim()) return;
    setQuestions((q) => [...q, question.trim()]);
    setQuestion("");
  };
  const addCard = () => {
    if (!cFront.trim()) return;
    setCards((c) => [...c, { front: cFront.trim(), back: cBack.trim() }]);
    setCFront("");
    setCBack("");
  };

  const save = async () => {
    if (!objective.trim()) {
      setError("An objective is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        objective: objective.trim(),
        assignments: assignments.map((a) => ({ resourceId: a.resourceId, locator: a.locator.trim() || null, kind: a.kind })),
        pretestQuestions: questions,
        cardDrafts: cards,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the plan.");
    } finally {
      setBusy(false);
    }
  };

  const resourceTitle = (id: string) => resources.find((r) => r.id === id)?.title ?? id;

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Objective */}
      <section className="flex flex-col gap-2">
        {milestones.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="font-medium text-text">Seed from a milestone (optional)</span>
            <select
              aria-label="Milestone"
              defaultValue=""
              onChange={(e) => {
                const m = milestones.find((x) => x.id === e.target.value);
                if (m) setObjective(m.capability);
              }}
              className={FIELD}
            >
              <option value="">— none —</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.capability}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="font-medium text-text">Objective</span>
          <textarea
            aria-label="Objective"
            rows={2}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Be able to…"
            className={FIELD}
          />
        </label>
      </section>

      {/* Assignments */}
      <section className="flex flex-col gap-2">
        <span className="font-medium text-text">Assignments to study</span>
        {assignments.length > 0 && (
          <ul className="flex flex-col gap-1">
            {assignments.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-text">
                  {resourceTitle(a.resourceId)} <span className="text-text-dim">({KIND_LABEL[a.kind]})</span>
                  {a.locator.trim() && <span className="text-text-dim"> · {a.locator.trim()}</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setAssignments((arr) => arr.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {resources.length === 0 ? (
          <p className="text-xs text-text-dim">
            No resources registered —{" "}
            <Link to="/resources" className="font-medium text-brand underline">
              register one
            </Link>{" "}
            to assign it.
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-sm border border-line p-3">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-text">Resource</span>
              <select aria-label="Assign resource" value={aResource} onChange={(e) => setAResource(e.target.value)} className={FIELD}>
                <option value="">— choose a resource —</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="font-medium text-text">Kind</span>
                <select aria-label="Assignment kind" value={aKind} onChange={(e) => setAKind(e.target.value as AssignmentKind)} className={FIELD}>
                  {ASSIGNMENT_KIND.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="font-medium text-text">Locator</span>
                <input
                  aria-label="Assignment locator"
                  value={aLocator}
                  onChange={(e) => setALocator(e.target.value)}
                  placeholder="page=10 / 00:15-00:23 / Ch.3"
                  className={FIELD}
                />
              </label>
            </div>
            <div>
              <Button size="sm" variant="secondary" disabled={!aResource} onClick={addAssignment}>
                Add assignment
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Pretest questions */}
      <section className="flex flex-col gap-2">
        <span className="font-medium text-text">Pretest questions</span>
        {questions.length > 0 && (
          <ul className="flex flex-col gap-1">
            {questions.map((q, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-text">{q}</span>
                <Button size="sm" variant="ghost" onClick={() => setQuestions((arr) => arr.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input aria-label="Pretest question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="A question to attempt cold" className={FIELD} />
          <Button size="sm" variant="secondary" disabled={!question.trim()} onClick={addQuestion}>
            Add
          </Button>
        </div>
      </section>

      {/* Card prompts */}
      <section className="flex flex-col gap-2">
        <span className="font-medium text-text">Card prompts</span>
        {cards.length > 0 && (
          <ul className="flex flex-col gap-1">
            {cards.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-text">
                  {c.front} {c.back && <span className="text-text-dim">→ {c.back}</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setCards((arr) => arr.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 rounded-sm border border-line p-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-text">Front</span>
            <input aria-label="Card prompt front" value={cFront} onChange={(e) => setCFront(e.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-text">Back (optional — complete while doing)</span>
            <input aria-label="Card prompt back" value={cBack} onChange={(e) => setCBack(e.target.value)} className={FIELD} />
          </label>
          <div>
            <Button size="sm" variant="secondary" disabled={!cFront.trim()} onClick={addCard}>
              Add card prompt
            </Button>
          </div>
        </div>
      </section>

      {error && <p className="text-danger">{error}</p>}
      <div className="flex gap-2 border-t border-line pt-3">
        <Button disabled={busy || !objective.trim()} onClick={() => void save()}>
          {busy ? "Saving…" : "Save plan"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
