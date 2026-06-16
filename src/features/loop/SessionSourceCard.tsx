import { useCallback, useState } from "react";
import { Button, Tag } from "../../components/ui";
import type { SessionSourceRow } from "../../db";

interface SessionSourceCardProps {
  source: SessionSourceRow;
  onToggleDone: () => void;
}

/** Extract a YouTube video ID from various URL formats, or null. */
function parseYoutubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.+&v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Best-effort thumbnail URL: YouTube thumbnails > favicon.ico from the host. Returns null when
 *  neither can be determined, letting the caller render a fallback emoji. */
function thumbnailUrl(url: string): string | null {
  const videoId = parseYoutubeVideoId(url);
  if (videoId) return `https://img.youtube.com/vi/${videoId}/default.jpg`;

  try {
    const origin = new URL(url).origin;
    return `${origin}/favicon.ico`;
  } catch {
    return null;
  }
}

/** Page range display: "pp. 12–34" when both bounds are set, "p. 12" for start only, etc. */
function pageDisplay(start: number | null, end: number | null): string | null {
  if (start !== null && end !== null && start !== end) return `pp. ${start}–${end}`;
  if (start !== null) return `p. ${start}`;
  if (end !== null) return `p. ${end}`;
  return null;
}

/** Timestamp display: "0:30–5:00" or "0:30" when only start is set. */
function timestampDisplay(start: number | null, end: number | null): string | null {
  const fmt = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  if (start !== null && end !== null && start !== end) return `${fmt(start)}–${fmt(end)}`;
  if (start !== null) return fmt(start);
  if (end !== null) return fmt(end);
  return null;
}

const TYPE_LABEL: Record<string, string> = {
  reading: "📄 Reading",
  watching: "🎬 Watching",
};

const TYPE_EMOJI: Record<string, string> = {
  reading: "📄",
  watching: "🎬",
};

/** A rich media card for a session source with favicon/YouTube thumbnail, title, type badge,
 *  page/timestamp info, open link, and done-toggle checkbox. */
export function SessionSourceCard({ source, onToggleDone }: SessionSourceCardProps) {
  const [imgError, setImgError] = useState(false);
  const thumb = thumbnailUrl(source.url);
  const pages = pageDisplay(source.start_page, source.end_page);
  const ts = timestampDisplay(source.start_seconds, source.end_seconds);

  const handleOpen = useCallback(() => {
    window.open(source.url, "_blank", "noopener,noreferrer");
  }, [source.url]);

  return (
    <div
      className={`flex items-start gap-3 rounded-md border px-3 py-3 transition-colors ${
        source.completed
          ? "border-success/30 bg-success/5"
          : "border-line bg-panel"
      }`}
    >
      {/* Thumbnail */}
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-panel-raised text-lg">
        {thumb && !imgError ? (
          <img
            src={thumb}
            alt=""
            className="size-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span aria-hidden>{TYPE_EMOJI[source.type] ?? "📄"}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{source.title}</span>
          <Tag tone={source.type === "watching" ? "brand" : "neutral"} className="shrink-0">
            {TYPE_LABEL[source.type] ?? source.type}
          </Tag>
        </div>

        {/* Page / timestamp info */}
        {(pages || ts) && (
          <p className="text-xs text-text-dim">
            {pages && <span>{pages}</span>}
            {pages && ts && <span> · </span>}
            {ts && <span>{ts}</span>}
          </p>
        )}

        {source.description && (
          <p className="line-clamp-2 text-xs text-text-dim">{source.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={source.completed}
            onChange={onToggleDone}
            className="size-4 accent-brand"
            aria-label={`Mark "${source.title}" ${source.completed ? "incomplete" : "done"}`}
          />
          <span className="text-text-dim">{source.completed ? "Done" : "Mark done"}</span>
        </label>
        {source.url && (
          <Button size="sm" variant="secondary" onClick={handleOpen}>
            Open
          </Button>
        )}
      </div>
    </div>
  );
}
