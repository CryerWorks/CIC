/**
 * Build the frontmatter object + the initial document for a new Project. Pure construction — the
 * frontmatter is the app-managed integration layer; the body is the learner's (rendered once from
 * the template, then never re-clobbered — research R2). The returned shape is structurally a vault
 * `NoteInput` so the sync layer hands it straight to `writeNote`.
 */

import { PROJECT_DISCRIMINATOR } from "./markers";
import { renderTemplateBody, type ProjectTemplateName } from "./templates";
import type { ProjectDocModel } from "./model";

/** The frontmatter object written to every Project file (research R2/M2). Omits null closed/template. */
export function buildFrontmatter(model: ProjectDocModel): Record<string, unknown> {
  const fm: Record<string, unknown> = {
    "cic-type": PROJECT_DISCRIMINATOR,
    "cic-id": model.id,
    "course-id": model.courseId,
    title: model.title,
    course: model.courseTitle,
    capability: model.capability,
    status: model.status,
    milestones: model.milestoneIds,
    opened: model.openedDate,
  };
  if (model.closedDate) fm.closed = model.closedDate;
  if (model.template) fm.template = model.template;
  return fm;
}

/** A full Project document for a brand-new file: frontmatter + the template body (framing woven into
 *  Problem — M1). Used ONCE at creation; later updates only swap the frontmatter (see merge.ts). */
export function renderProjectDoc(
  model: ProjectDocModel,
  framing?: string | null,
): { frontmatter: Record<string, unknown>; body: string } {
  return {
    frontmatter: buildFrontmatter(model),
    body: renderTemplateBody((model.template as ProjectTemplateName | null) ?? null, framing),
  };
}
