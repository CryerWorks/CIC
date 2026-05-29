import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui";
import type { CardInput } from "./useCourseCards";

interface CardFormProps {
  initial?: CardInput;
  submitLabel: string;
  onSubmit: (input: CardInput) => Promise<void>;
  onCancel: () => void;
}

/** Author/edit a flashcard: front (prompt) + back (answer), with an optional source-note path.
 *  (Resource/block-ref citations are added to this form in US4.) */
export function CardForm({ initial, submitLabel, onSubmit, onCancel }: CardFormProps) {
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");
  const [notePath, setNotePath] = useState(initial?.notePath ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) {
      setError("Both the front and back are required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ front: front.trim(), back: back.trim(), notePath: notePath.trim() || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the card.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-text";

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text">Front</span>
        <textarea aria-label="Front" rows={2} value={front} onChange={(e) => setFront(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text">Back</span>
        <textarea aria-label="Back" rows={3} value={back} onChange={(e) => setBack(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text">Source note (optional)</span>
        <input
          aria-label="Source note"
          value={notePath}
          onChange={(e) => setNotePath(e.target.value)}
          placeholder="Notes/Limits.md"
          className={field}
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
