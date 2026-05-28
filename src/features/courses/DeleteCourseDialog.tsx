import { useEffect, useId, useRef, useState } from "react";
import { Button, Callout } from "../../components/ui";
import type { DeleteCourseMode, RemoveCourseResult, RemoveCourseOptions } from "./sync/delete";

interface Props {
  title: string;
  /** The MOC's vault-relative path, or null for a course with no materialized MOC (e.g. a row
   *  left over from a failed save). When null there is no vault choice to make. */
  mocPath: string | null;
  onCancel: () => void;
  /** Performs the removal. Resolves `removed` (parent closes) or `conflict` (we offer "delete
   *  anyway"). */
  onConfirm: (mode: DeleteCourseMode, opts: RemoveCourseOptions) => Promise<RemoveCourseResult>;
}

/**
 * Course-delete confirmation. The DB rows always go; the vault is sacred, so when a MOC exists the
 * user chooses to keep the note (detach) or delete the file too. A hard-delete that hits
 * never-clobber drift surfaces here as "delete anyway" rather than silently forcing. Hand-rolled
 * modal (focus trap, Escape, focus return) to match DeleteDomainDialog and behave under jsdom.
 */
export function DeleteCourseDialog({ title, mocPath, onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const keepId = useId();
  const deleteId = useId();
  const [mode, setMode] = useState<DeleteCourseMode>("detach");
  const [conflict, setConflict] = useState<{ reason: "drifted" | "unmanaged"; mocPath: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const focusables = () =>
      ref.current?.querySelectorAll<HTMLElement>("button, input") ?? [];
    focusables()[0]?.focus();

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
      trigger?.focus();
    };
  }, [onCancel]);

  const handleDelete = async () => {
    setBusy(true);
    const res = await onConfirm(mode, conflict ? { overwrite: true } : {});
    if (res.status === "conflict") {
      setConflict({ reason: res.reason, mocPath: res.mocPath });
      setBusy(false);
    }
    // `removed` → the parent unmounts this dialog; no further state update here.
  };

  const confirmLabel = conflict ? "Delete anyway" : "Delete course";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-md border border-line bg-panel p-5"
      >
        <h2 id={titleId} className="text-lg font-semibold text-text">
          Delete “{title}”?
        </h2>

        {mocPath ? (
          <>
            <p className="mt-2 text-sm text-text-dim">
              This removes the course from CIC. Choose what happens to its note in your vault:
            </p>
            <fieldset className="mt-3 flex flex-col gap-3" disabled={busy}>
              <div className="flex items-start gap-2">
                <input
                  id={keepId}
                  type="radio"
                  name="moc-disposition"
                  className="mt-1"
                  checked={mode === "detach"}
                  onChange={() => setMode("detach")}
                />
                <label htmlFor={keepId} className="text-sm">
                  <span className="text-text">Keep the note in my vault</span>
                  <span className="block text-text-dim">
                    Leaves <code className="text-text">{mocPath}</code> as a plain note (CIC tags
                    stripped so it won’t re-import).
                  </span>
                </label>
              </div>
              <div className="flex items-start gap-2">
                <input
                  id={deleteId}
                  type="radio"
                  name="moc-disposition"
                  className="mt-1"
                  checked={mode === "deleteFile"}
                  onChange={() => setMode("deleteFile")}
                />
                <label htmlFor={deleteId} className="text-sm">
                  <span className="text-text">Also delete the MOC file</span>
                  <span className="block text-text-dim">
                    Permanently deletes <code className="text-text">{mocPath}</code> from your vault,
                    including anything you wrote under Reflections.
                  </span>
                </label>
              </div>
            </fieldset>
          </>
        ) : (
          <p className="mt-2 text-sm text-text-dim">
            This course has no MOC in your vault yet. This removes it from CIC. This can’t be undone.
          </p>
        )}

        {conflict && (
          <Callout variant="warn" title="MOC changed in Obsidian" className="mt-3">
            <span>
              {conflict.reason === "drifted"
                ? `${conflict.mocPath} was edited outside CIC since it was last written.`
                : `${conflict.mocPath} isn’t tracked by CIC (it wasn’t written by the app).`}{" "}
              Delete it anyway?
            </span>
          </Callout>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void handleDelete()} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
