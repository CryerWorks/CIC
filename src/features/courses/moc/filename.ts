/**
 * Map a Course title to a unique, human-readable MOC path under `Courses/` (research R8).
 * The slug keeps the title readable (not lowercased/dasherized) — just trimmed, whitespace-
 * collapsed, and stripped of filesystem-illegal characters — so the file is pleasant to see in
 * Obsidian. Collisions with already-taken paths get a ` (2)`, ` (3)`, … suffix.
 */

const COURSES_DIR = "Courses";
// Characters illegal in Windows/macOS/Linux filenames (superset).
const ILLEGAL = /[\\/:*?"<>|]/g;

function slugify(title: string): string {
  const cleaned = title.replace(ILLEGAL, "").replace(/\s+/g, " ").trim();
  return cleaned || "Untitled Course";
}

export function mocRelPathFor(title: string, taken: string[]): string {
  const slug = slugify(title);
  const takenSet = new Set(taken);

  let candidate = `${COURSES_DIR}/${slug}.md`;
  let n = 2;
  while (takenSet.has(candidate)) {
    candidate = `${COURSES_DIR}/${slug} (${n}).md`;
    n += 1;
  }
  return candidate;
}
