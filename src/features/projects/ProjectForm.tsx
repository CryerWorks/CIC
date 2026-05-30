import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui";
import { PROJECT_TEMPLATES } from "./doc";
import type { Milestone, Resource } from "../../db";
import type { CreateProjectFormInput, ProjectEditData, ResourceRefInput } from "./useProjects";

const FIELD = "w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-text";

const TEMPLATE_LABEL: Record<string, string> = {
  "math/proof": "Math / proof",
  "cs/implement": "CS / implement",
  freeform: "Freeform",
};

/**
 * Author or edit a Project (Feature 015, US1). Required: title, a one-line capability statement, and
 * ≥1 of the Course's Milestones. Optional: a starting template, an opening problem framing (woven
 * into the new file's Problem section once — M1), and Resource references with locators. Save is
 * disabled until the required fields are present. When editing a Project that was left with zero
 * Milestones (a Milestone was deleted — M3), the form opens fine and simply re-requires ≥1 on save.
 */
export function ProjectForm({
  milestones,
  resources,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  milestones: Milestone[];
  resources: Resource[];
  initial?: ProjectEditData;
  submitLabel: string;
  onSubmit: (input: CreateProjectFormInput) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [capability, setCapability] = useState(initial?.capability ?? "");
  const [milestoneIds, setMilestoneIds] = useState<string[]>(initial?.milestoneIds ?? []);
  const [template, setTemplate] = useState<string>(initial?.template ?? "");
  const [framing, setFraming] = useState("");
  const [refs, setRefs] = useState<ResourceRefInput[]>(initial?.resources ?? []);
  const [rResource, setRResource] = useState("");
  const [rLocator, setRLocator] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMilestone = (id: string) =>
    setMilestoneIds((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));

  const addRef = () => {
    if (!rResource) return;
    setRefs((cur) => [...cur, { resourceId: rResource, locator: rLocator.trim() || null }]);
    setRResource("");
    setRLocator("");
  };

  const canSave = title.trim() !== "" && capability.trim() !== "" && milestoneIds.length > 0;
  const resourceTitle = (id: string) => resources.find((r) => r.id === id)?.title ?? id;

  const save = async () => {
    if (!canSave) {
      setError("A title, a capability, and at least one Milestone are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onSubmit({
        title: title.trim(),
        capability: capability.trim(),
        milestoneIds,
        template: template || null,
        framing: framing.trim() || undefined,
        resources: refs,
      });
      if (!result.ok) setError(result.error ?? "Couldn't save the project.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-text">Title</span>
        <input aria-label="Project title" value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium text-text">Capability — what does completing this prove you can do?</span>
        <input
          aria-label="Project capability"
          value={capability}
          onChange={(e) => setCapability(e.target.value)}
          placeholder="I can…"
          className={FIELD}
        />
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="font-medium text-text">Milestones this exercises (at least one)</legend>
        {milestones.length === 0 ? (
          <p className="text-xs text-text-dim">
            This course has no milestones yet — add one on the Courses screen first.
          </p>
        ) : (
          <div className="flex flex-col gap-1 rounded-sm border border-line p-3">
            {milestones.map((m) => (
              <label key={m.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Milestone: ${m.capability}`}
                  checked={milestoneIds.includes(m.id)}
                  onChange={() => toggleMilestone(m.id)}
                />
                <span className="text-text">{m.capability}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="font-medium text-text">Template (shapes the starting note only)</span>
        <select aria-label="Project template" value={template} onChange={(e) => setTemplate(e.target.value)} className={FIELD}>
          <option value="">— none (freeform) —</option>
          {PROJECT_TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {TEMPLATE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
      </label>

      {!initial && (
        <label className="flex flex-col gap-1">
          <span className="font-medium text-text">Opening framing (optional)</span>
          <textarea
            aria-label="Opening framing"
            rows={2}
            value={framing}
            onChange={(e) => setFraming(e.target.value)}
            placeholder="Frame the problem you're about to tackle…"
            className={FIELD}
          />
        </label>
      )}

      <section className="flex flex-col gap-2">
        <span className="font-medium text-text">Resources (optional)</span>
        {refs.length > 0 && (
          <ul className="flex flex-col gap-1">
            {refs.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-text">
                  {resourceTitle(r.resourceId)}
                  {r.locator && <span className="text-text-dim"> · {r.locator}</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setRefs((arr) => arr.filter((_, idx) => idx !== i))}>
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
            to reference it.
          </p>
        ) : (
          <div className="flex gap-2">
            <select aria-label="Reference resource" value={rResource} onChange={(e) => setRResource(e.target.value)} className={FIELD}>
              <option value="">— choose a resource —</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            <input
              aria-label="Reference locator"
              value={rLocator}
              onChange={(e) => setRLocator(e.target.value)}
              placeholder="Ch.3"
              className={FIELD}
            />
            <Button size="sm" variant="secondary" disabled={!rResource} onClick={addRef}>
              Add
            </Button>
          </div>
        )}
      </section>

      {error && <p className="text-danger">{error}</p>}
      <div className="flex gap-2 border-t border-line pt-3">
        <Button disabled={busy || !canSave} onClick={() => void save()}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
