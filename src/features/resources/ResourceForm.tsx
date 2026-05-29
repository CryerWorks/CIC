import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui";
import { RESOURCE_KIND, type ResourceKind, type Course, type Domain } from "../../db";
import { useSourceFiles } from "./SourceFilesProvider";
import { URL_KINDS, isFileKind, basename } from "./sourceFiles";
import type { ResourceInput } from "./useResources";

const KIND_LABEL: Record<ResourceKind, string> = {
  pdf: "PDF",
  epub: "EPUB",
  markdown: "Markdown",
  video_file: "Video file",
  video_url: "Video URL",
  web_page: "Web page",
  book: "Book",
  audio: "Audio",
};

const FIELD_CLASS = "w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-text";

/** Module-scope so it isn't remounted on every keystroke (which would drop input focus). */
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-text">{label}</span>
      <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLASS} />
    </label>
  );
}

interface ResourceFormProps {
  initial?: ResourceInput;
  courses: Course[];
  domains: Domain[];
  /** Courses this Resource is currently linked to (edit mode); seeds the link control. */
  linkedCourseIds?: string[];
  submitLabel: string;
  onSubmit: (input: ResourceInput) => Promise<void>;
  onCancel: () => void;
}

/** Register/edit a Resource with kind-appropriate metadata (R13). Course links are managed with a
 *  domain-grouped "add a course" dropdown + removable chips (shown in both create and edit — a
 *  Resource can back several Courses; grouping by Domain keeps the picker uncluttered). */
export function ResourceForm({ initial, courses, domains, linkedCourseIds, submitLabel, onSubmit, onCancel }: ResourceFormProps) {
  const sourceFiles = useSourceFiles();
  const m = initial?.metadata as Record<string, unknown> | undefined;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<ResourceKind>(initial?.kind ?? "pdf");
  /** The Resource's already-stored file path (edit mode) — shown, not edited. */
  const storedFilePath = initial?.filePath ?? null;
  /** A newly-picked source file to internalize on submit (file-kinds). */
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [url, setUrl] = useState(initial?.url ?? "");
  const [author, setAuthor] = useState(str(m?.author));
  const [isbn, setIsbn] = useState(str(m?.isbn));
  const [pages, setPages] = useState(str(m?.pages));
  const [durationSec, setDurationSec] = useState(str(m?.durationSec));
  const [channel, setChannel] = useState(str(m?.channel));
  const [site, setSite] = useState(str(m?.site));
  const [courseIds, setCourseIds] = useState<string[]>(linkedCourseIds ?? []);
  const [domainId, setDomainId] = useState<string>(initial?.domainId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleCourse = (id: string) =>
    setCourseIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const onPick = async () => {
    const path = await sourceFiles.pickFile(kind);
    if (path) setPickedPath(path);
  };

  const metadata = (): Record<string, unknown> => {
    switch (kind) {
      case "book":
        return clean({ author, isbn });
      case "pdf":
      case "epub":
      case "markdown":
        return clean({ author, pages: num(pages) });
      case "video_file":
      case "audio":
        return clean({ durationSec: num(durationSec) });
      case "video_url":
        return clean({ channel });
      case "web_page":
        return clean({ site });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        kind,
        // File-kinds: pass the existing stored path through unchanged; the new pick (if any) is
        // internalized by the hook. URL-kinds carry no file.
        filePath: isFileKind(kind) ? storedFilePath : null,
        pickedFilePath: isFileKind(kind) ? pickedPath : null,
        url: URL_KINDS.includes(kind) ? url.trim() || null : null,
        metadata: metadata(),
        domainId: domainId || null,
        linkCourseIds: courseIds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the resource.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
      <Field label="Title" value={title} onChange={setTitle} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text">Kind</span>
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)} className={FIELD_CLASS}>
          {RESOURCE_KIND.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      {isFileKind(kind) && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-text">Source file</span>
          {pickedPath ? (
            <p className="text-xs text-text">Selected: {basename(pickedPath)}</p>
          ) : storedFilePath ? (
            <p className="text-xs text-text-dim">Stored: {basename(storedFilePath)}</p>
          ) : (
            <p className="text-xs text-text-dim">No file attached yet.</p>
          )}
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={() => void onPick()}>
              {storedFilePath || pickedPath ? "Replace…" : "Choose file…"}
            </Button>
          </div>
        </div>
      )}
      {URL_KINDS.includes(kind) && <Field label="URL" value={url} onChange={setUrl} />}

      {(kind === "book" || kind === "pdf" || kind === "epub" || kind === "markdown") && (
        <Field label="Author" value={author} onChange={setAuthor} />
      )}
      {kind === "book" && <Field label="ISBN" value={isbn} onChange={setIsbn} />}
      {(kind === "pdf" || kind === "epub" || kind === "markdown") && (
        <Field label="Pages" value={pages} onChange={setPages} />
      )}
      {(kind === "video_file" || kind === "audio") && (
        <Field label="Duration (seconds)" value={durationSec} onChange={setDurationSec} />
      )}
      {kind === "video_url" && <Field label="Channel" value={channel} onChange={setChannel} />}
      {kind === "web_page" && <Field label="Site" value={site} onChange={setSite} />}

      {domains.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-text">Home domain</span>
          <select
            aria-label="Home domain"
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">— none —</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {courses.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-text">Linked courses</span>
          <p className="text-xs text-text-dim">Cards in a linked course can cite this resource.</p>

          {courseIds.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {courseIds.map((id) => {
                const c = courses.find((x) => x.id === id);
                return (
                  <li key={id}>
                    <span className="inline-flex items-center gap-1 rounded-sm border border-line bg-surface-sunken px-2 py-1 text-text">
                      {c?.title ?? id}
                      <button
                        type="button"
                        aria-label={`Unlink ${c?.title ?? id}`}
                        onClick={() => toggleCourse(id)}
                        className="text-text-dim hover:text-text"
                      >
                        ×
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <select
            aria-label="Add a course"
            value=""
            onChange={(e) => {
              if (e.target.value) toggleCourse(e.target.value);
            }}
            className={FIELD_CLASS}
          >
            <option value="">+ Add a course…</option>
            {domains.map((d) => {
              const opts = courses.filter((c) => c.domain_id === d.id && !courseIds.includes(c.id));
              if (opts.length === 0) return null;
              return (
                <optgroup key={d.id} label={d.name}>
                  {opts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""));
}
