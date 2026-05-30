import { useEffect, useId, useRef, useState } from "react";
import { Button, Callout } from "../../components/ui";
import type { DeleteProjectMode, RemoveProjectResult, RemoveProjectOptions } from "./sync/delete";

interface Props {
  title: string;
  /** The file's vault-relative path, or null for a Project with no materialized file. */
  projectPath: string | null;
  onCancel: () => void;
  onConfirm: (mode: DeleteProjectMode, opts: RemoveProjectOptions) => Promise<RemoveProjectResult>;
}

/**
 * Project-delete confirmation (Feature 015, US3). The DB rows always go; the vault is sacred, so when
 * a file exists the learner chooses to keep the note (detach) or delete the file too. A hard-delete
 * that hits never-clobber drift surfaces as "delete anyway" rather than silently forcing. Mirrors
 * `DeleteCourseDialog` (focus trap, Escape, focus return).
 */
export function DeleteProjectDialog({ title, projectPath, onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const keepId = useId();
  const deleteId = useId();
  const [mode, setMode] = useState<DeleteProjectMode>("detach");
  const [conflict, setConflict] = useState<{ reason: "drifted" | "unmanaged"; projectPath: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const focusables = () => ref.current?.querySelectorAll<HTMLElement>("button, input") ?? [];
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
      setConflict({ reason: res.reason, projectPath: res.projectPath });
      setBusy(false);
    }
  };

  const confirmLabel = conflict ? "Delete anyway" : "Delete project";

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

        {projectPath ? (
          <>
            <p className="mt-2 text-sm text-text-dim">
              This removes the project from CIC. Choose what happens to its note in your vault:
            </p>
            <fieldset className="mt-3 flex flex-col gap-3" disabled={busy}>
              <div className="flex items-start gap-2">
                <input
                  id={keepId}
                  type="radio"
                  name="project-disposition"
                  className="mt-1"
                  checked={mode === "detach"}
                  onChange={() => setMode("detach")}
                />
                <label htmlFor={keepId} className="text-sm">
                  <span className="text-text">Keep the note in my vault</span>
                  <span className="block text-text-dim">
                    Leaves <code className="text-text">{projectPath}</code> as a plain note (CIC tags
                    stripped so it won’t re-import).
                  </span>
                </label>
              </div>
              <div className="flex items-start gap-2">
                <input
                  id={deleteId}
                  type="radio"
                  name="project-disposition"
                  className="mt-1"
                  checked={mode === "deleteFile"}
                  onChange={() => setMode("deleteFile")}
                />
                <label htmlFor={deleteId} className="text-sm">
                  <span className="text-text">Also delete the note file</span>
                  <span className="block text-text-dim">
                    Permanently deletes <code className="text-text">{projectPath}</code> from your
                    vault, including your work and reflection.
                  </span>
                </label>
              </div>
            </fieldset>
          </>
        ) : (
          <p className="mt-2 text-sm text-text-dim">
            This project has no note in your vault yet. This removes it from CIC. This can’t be undone.
          </p>
        )}

        {conflict && (
          <Callout variant="warn" title="Note changed in Obsidian" className="mt-3">
            <span>
              {conflict.reason === "drifted"
                ? `${conflict.projectPath} was edited outside CIC since it was last written.`
                : `${conflict.projectPath} isn’t tracked by CIC (it wasn’t written by the app).`}{" "}
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
