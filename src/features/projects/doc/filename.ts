/**
 * Map a Project title to a unique, human-readable path under `Projects/` (mirrors `moc/filename.ts`).
 * The slug keeps the title readable — trimmed, whitespace-collapsed, filesystem-illegal characters
 * stripped — so the file is pleasant in Obsidian. Collisions get a ` (2)`, ` (3)`, … suffix.
 */

const PROJECTS_DIR = "Projects";
const ILLEGAL = /[\\/:*?"<>|]/g;

function slugify(title: string): string {
  const cleaned = title.replace(ILLEGAL, "").replace(/\s+/g, " ").trim();
  return cleaned || "Untitled Project";
}

export function projectRelPathFor(title: string, taken: string[]): string {
  const slug = slugify(title);
  const takenSet = new Set(taken);

  let candidate = `${PROJECTS_DIR}/${slug}.md`;
  let n = 2;
  while (takenSet.has(candidate)) {
    candidate = `${PROJECTS_DIR}/${slug} (${n}).md`;
    n += 1;
  }
  return candidate;
}
