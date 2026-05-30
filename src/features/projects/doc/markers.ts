/**
 * The Project document contract (research R2). Unlike the Course MOC, a Project has **no
 * app-managed body sections** — its body is the learner's freeform workspace (Problem · Approach ·
 * Work · Reflection), rendered once from a template at creation and never re-clobbered. The only
 * app-managed surface is the frontmatter. So there are no `<!-- cic:* -->` body markers here; this
 * file just names the `cic-type` discriminator and the body headings the templates use.
 */

/** The `cic-type` frontmatter value that marks a vault `.md` as a CIC Project (rescan discriminator). */
export const PROJECT_DISCRIMINATOR = "project";

/** The suggested body headings (templates shape these; they are never validated/enforced). */
export const BODY_HEADINGS = ["Problem", "Approach", "Work", "Reflection"] as const;
