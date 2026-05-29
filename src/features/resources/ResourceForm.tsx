import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui";
import { RESOURCE_KIND, type ResourceKind, type Course } from "../../db";
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
const FILE_KINDS: ResourceKind[] = ["pdf", "epub", "markdown", "video_file", "audio"];
const URL_KINDS: ResourceKind[] = ["video_url", "web_page"];

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
  submitLabel: string;
  onSubmit: (input: ResourceInput) => Promise<void>;
  onCancel: () => void;
}

/** Register/edit a Resource with kind-appropriate metadata (R13). A link-to-Course dropdown is
 *  offered when creating. */
export function ResourceForm({ initial, courses, submitLabel, onSubmit, onCancel }: ResourceFormProps) {
  const m = initial?.metadata as Record<string, unknown> | undefined;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<ResourceKind>(initial?.kind ?? "pdf");
  const [filePath, setFilePath] = useState(initial?.filePath ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [author, setAuthor] = useState(str(m?.author));
  const [isbn, setIsbn] = useState(str(m?.isbn));
  const [pages, setPages] = useState(str(m?.pages));
  const [durationSec, setDurationSec] = useState(str(m?.durationSec));
  const [channel, setChannel] = useState(str(m?.channel));
  const [site, setSite] = useState(str(m?.site));
  const [linkCourseId, setLinkCourseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        filePath: FILE_KINDS.includes(kind) ? filePath.trim() || null : null,
        url: URL_KINDS.includes(kind) ? url.trim() || null : null,
        metadata: metadata(),
        linkCourseId: linkCourseId || null,
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

      {FILE_KINDS.includes(kind) && <Field label="File path" value={filePath} onChange={setFilePath} />}
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

      {!initial && courses.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-text">Link to course (optional)</span>
          <select aria-label="Link to course" value={linkCourseId} onChange={(e) => setLinkCourseId(e.target.value)} className={FIELD_CLASS}>
            <option value="">— none —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      )}

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

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""));
}
