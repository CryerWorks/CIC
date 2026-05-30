import { useEffect, useId, useRef, useState } from "react";
import { Button, Segmented } from "../../components/ui";
import type { Resource } from "../../db";
import type { CloseFormInput } from "./useProjects";

/**
 * Close a Project (Feature 015, US2 / FR-011/FR-012). The learner chooses **Complete** (capability
 * claimed) or **Abandon** (neutral — never framed as failure), writes a short reflection, and MAY
 * add cards from it. Every card is learner-authored and manual — nothing is auto-generated, nothing
 * is auto-marked mastered (Constitution III). Hand-rolled modal (focus trap / Escape / focus return).
 */
export function CloseProjectDialog({
  title,
  resources,
  onCancel,
  onConfirm,
}: {
  title: string;
  resources: Resource[];
  onCancel: () => void;
  onConfirm: (input: CloseFormInput) => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [outcome, setOutcome] = useState<"complete" | "abandoned">("complete");
  const [reflection, setReflection] = useState("");
  const [cards, setCards] = useState<{ front: string; back: string }[]>([]);
  const [cFront, setCFront] = useState("");
  const [cBack, setCBack] = useState("");
  const [cites, setCites] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const focusables = () => ref.current?.querySelectorAll<HTMLElement>("button, input, textarea, select") ?? [];
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [onCancel]);

  const addCard = () => {
    if (!cFront.trim()) return;
    setCards((c) => [...c, { front: cFront.trim(), back: cBack.trim() }]);
    setCFront("");
    setCBack("");
  };

  const toggleCite = (id: string) =>
    setCites((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm({ outcome, reflection, cards, citeResourceIds: cites });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-md border border-line bg-panel p-5"
      >
        <h2 id={titleId} className="text-lg font-semibold text-text">
          Close “{title}”
        </h2>

        <div className="mt-3 flex flex-col gap-4 text-sm">
          <Segmented
            ariaLabel="Outcome"
            value={outcome}
            onChange={(v) => setOutcome(v as "complete" | "abandoned")}
            options={[
              { value: "complete", label: "Complete" },
              { value: "abandoned", label: "Set aside" },
            ]}
          />
          <p className="text-text-dim">
            {outcome === "complete"
              ? "You're claiming the capability this project set out to prove."
              : "Setting a project aside is fine — it's not a failure, just not right now."}
          </p>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-text">Reflection — what did you have to look up? what was hard?</span>
            <textarea
              aria-label="Reflection"
              rows={3}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              className="w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-text"
            />
          </label>

          <section className="flex flex-col gap-2">
            <span className="font-medium text-text">Spawn review cards (optional)</span>
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
              <input
                aria-label="Card front"
                value={cFront}
                onChange={(e) => setCFront(e.target.value)}
                placeholder="Front"
                className="w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-text"
              />
              <input
                aria-label="Card back"
                value={cBack}
                onChange={(e) => setCBack(e.target.value)}
                placeholder="Back"
                className="w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-text"
              />
              <div>
                <Button size="sm" variant="secondary" disabled={!cFront.trim()} onClick={addCard}>
                  Add card
                </Button>
              </div>
            </div>
            {resources.length > 0 && cards.length > 0 && (
              <fieldset className="flex flex-col gap-1">
                <legend className="text-xs font-medium text-text-dim">Cite resources on spawned cards (optional)</legend>
                {resources.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      aria-label={`Cite: ${r.title}`}
                      checked={cites.includes(r.id)}
                      onChange={() => toggleCite(r.id)}
                    />
                    <span className="text-text">{r.title}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </section>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={busy}>
            {busy ? "Closing…" : outcome === "complete" ? "Complete project" : "Set aside"}
          </Button>
        </div>
      </div>
    </div>
  );
}
