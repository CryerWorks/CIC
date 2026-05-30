/**
 * Validate a Project file's frontmatter against the schema (the body is learner-owned and surfaced
 * untouched). Returns a typed `ParsedProject` or a `ProjectParseError` — never throws. The rescan
 * layer uses `readNoteAs(ProjectFrontmatterSchema)` directly (same validation); this pure helper is
 * the unit-testable equivalent over an already-read `{ data, body }`.
 */

import { ProjectFrontmatterSchema } from "./frontmatter";
import { ProjectParseError, type ParsedProject } from "./model";

export function parseProjectFile(raw: {
  data: Record<string, unknown>;
  body: string;
}): ParsedProject | ProjectParseError {
  const result = ProjectFrontmatterSchema.safeParse(raw.data);
  if (!result.success) {
    return new ProjectParseError(result.error.issues.map((i) => i.message).join("; "));
  }
  return { frontmatter: result.data, body: raw.body };
}
