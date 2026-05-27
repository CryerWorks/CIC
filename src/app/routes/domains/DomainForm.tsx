import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "../../../components/ui";
import { cx } from "../../../components/ui/types";
import { DOMAIN_PALETTE, DEFAULT_DOMAIN_COLOR } from "./palette";
import type { Domain } from "../../../db";
import type { DomainInput, MutationResult } from "./useDomains";

interface DomainFormProps {
  /** Present → edit mode (pre-filled); absent → create mode. */
  initial?: Domain;
  onSubmit: (input: DomainInput) => Promise<MutationResult>;
  onCancel: () => void;
}

export function DomainForm({ initial, onSubmit, onCancel }: DomainFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? DEFAULT_DOMAIN_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const errorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  // Focus the first field when the form opens (programmatic focus — the autoFocus prop is
  // discouraged for a11y).
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await onSubmit({ name, color });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      nameRef.current?.focus(); // move focus to the field to correct
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="text-sm font-semibold text-text">
          Name
        </label>
        <input
          id={nameId}
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-semibold text-text">Color</legend>
        {/* Native radios: correct radiogroup semantics + arrow-key navigation for free. The
            visible swatch is the styled <span>; the input is screen-reader-only. */}
        <div className="flex gap-2">
          {DOMAIN_PALETTE.map((c) => (
            <label key={c.hex} className="cursor-pointer">
              <input
                type="radio"
                name="domain-color"
                value={c.hex}
                checked={c.hex === color}
                onChange={() => setColor(c.hex)}
                aria-label={c.label}
                className="peer sr-only"
              />
              <span
                aria-hidden
                style={{ backgroundColor: c.hex }}
                className={cx(
                  "block h-7 w-7 rounded-full ring-offset-2 ring-offset-surface",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-brand",
                  c.hex === color ? "ring-2 ring-text" : "",
                )}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {initial ? "Save changes" : "Create domain"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
