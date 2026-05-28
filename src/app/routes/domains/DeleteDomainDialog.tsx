import { useEffect, useId, useRef } from "react";
import { Button } from "../../../components/ui";
import type { Domain } from "../../../db";

interface Props {
  domain: Domain;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Destructive-delete confirmation (FR-010). A modal that names the cascade consequence, traps
 * focus, closes on Escape, and returns focus to the trigger on close. (Hand-rolled rather than
 * native <dialog> so it behaves under jsdom too.)
 */
export function DeleteDomainDialog({ domain, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const focusables = () => ref.current?.querySelectorAll<HTMLElement>("button") ?? [];
    focusables()[0]?.focus(); // focus Cancel (first) on open

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus(); // return focus to whatever opened the dialog
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-md border border-line bg-panel p-5"
      >
        <h2 id={titleId} className="text-lg font-semibold text-text">
          Delete “{domain.name}”?
        </h2>
        <p id={descId} className="mt-2 text-sm text-text-dim">
          This also removes its Campaigns and Courses (and everything beneath them). This can’t be
          undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete domain
          </Button>
        </div>
      </div>
    </div>
  );
}
