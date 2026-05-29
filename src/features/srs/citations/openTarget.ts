import type { Resource } from "../../../db";

/**
 * Build a best-effort opener target for a Resource citation from its kind + file/url + locator
 * (F3.7 / R8): a PDF at `#page=N`, a video URL at `?t=N`, a web page at `#anchor`, a file kind at
 * `file://…`. Physical books (and file-less audio) have no auto-open target — the UI shows the
 * locator string instead. Returns `null` when nothing can be opened.
 */
export function resourceTarget(resource: Resource, locator: string | null): string | null {
  const loc = locator?.trim() || null;
  const page = loc?.match(/\d+/)?.[0] ?? null;

  switch (resource.kind) {
    case "pdf": {
      if (!resource.file_path) return null;
      const base = toFileUrl(resource.file_path);
      return page ? `${base}#page=${page}` : base;
    }
    case "web_page": {
      if (!resource.url) return null;
      return loc ? `${resource.url}#${loc.replace(/^#/, "")}` : resource.url;
    }
    case "video_url": {
      if (!resource.url) return null;
      const seconds = loc ? toSeconds(loc) : null;
      if (!seconds) return resource.url;
      return resource.url.includes("?") ? `${resource.url}&t=${seconds}` : `${resource.url}?t=${seconds}`;
    }
    case "epub":
    case "markdown":
    case "video_file":
    case "audio":
      return resource.file_path ? toFileUrl(resource.file_path) : null;
    case "book":
      return null;
  }
}

function toFileUrl(p: string): string {
  const norm = p.replace(/\\/g, "/");
  if (/^[a-z]+:\/\//i.test(norm)) return norm; // already a URL
  return `file://${norm.startsWith("/") ? "" : "/"}${norm}`;
}

/** A video locator → seconds: plain digits as-is, `mm:ss`/`hh:mm:ss` summed, else the first number. */
function toSeconds(loc: string): string | null {
  const s = loc.trim();
  if (/^\d+$/.test(s)) return s;
  if (/^\d+(:\d+)+$/.test(s)) {
    return String(s.split(":").reduce((acc, part) => acc * 60 + Number(part), 0));
  }
  return s.match(/\d+/)?.[0] ?? null;
}

async function defaultOpen(target: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(target);
}

/**
 * Open a citation target, swallowing any failure into `{ opened: false }` (FR-017 / SC-006) — a
 * missing file, unreachable URL, or `null` target never throws; the UI then shows the locator
 * text. The `open` fn is injected so this stays Tauri-free in tests.
 */
export async function openCitation(
  target: string | null,
  open: (target: string) => Promise<void> = defaultOpen,
): Promise<{ opened: boolean }> {
  if (!target) return { opened: false };
  try {
    await open(target);
    return { opened: true };
  } catch {
    return { opened: false };
  }
}
