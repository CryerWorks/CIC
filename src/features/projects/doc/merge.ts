/**
 * The only "update" paths after a Project is created (research R2/R3). A Project's body is
 * learner-owned, so an update never re-renders it:
 *
 *  - `swapFrontmatter` — replace the frontmatter block, keep the body byte-for-byte. This backs
 *    every status / title / capability change.
 *  - `appendReflection` — additive append of the close reflection under a `## Reflection (closed …)`
 *    heading; never overwrites existing content; a blank reflection is a no-op.
 */

import { buildFrontmatter } from "./render";
import type { ProjectDocModel } from "./model";

/** `{ frontmatter, body }` (structurally a vault `NoteInput`) with the body preserved verbatim. */
export function swapFrontmatter(
  existingBody: string,
  model: ProjectDocModel,
): { frontmatter: Record<string, unknown>; body: string } {
  return { frontmatter: buildFrontmatter(model), body: existingBody };
}

/** Append the close reflection to the body (additive — never clobbers). No-op when blank. */
export function appendReflection(existingBody: string, reflection: string, closedDate: string): string {
  const trimmed = reflection.trim();
  if (!trimmed) return existingBody;
  const base = existingBody.replace(/\s*$/, "");
  return `${base}\n\n## Reflection (closed ${closedDate})\n\n${trimmed}\n`;
}
