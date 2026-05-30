/**
 * Public surface of the pure Project document module. The sole owner of the Project frontmatter
 * contract; the sync layer composes these with the vault reader/writer + db repos. Pure + I/O-free —
 * nothing here imports React, the vault, or the db runtime (only the `ProjectStatus` enum type).
 */

export { buildFrontmatter, renderProjectDoc } from "./render";
export { renderTemplateBody, PROJECT_TEMPLATES, type ProjectTemplateName } from "./templates";
export { swapFrontmatter, appendReflection } from "./merge";
export { parseProjectFile } from "./parse";
export { projectRelPathFor } from "./filename";
export { ProjectFrontmatterSchema, type ProjectFrontmatter } from "./frontmatter";
export { PROJECT_DISCRIMINATOR, BODY_HEADINGS } from "./markers";
export { ProjectParseError, type ProjectDocModel, type ParsedProject } from "./model";
