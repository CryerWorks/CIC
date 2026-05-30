/**
 * The three V1 seed templates (PRD F11.2 / research R9). Each returns the *initial* freeform body
 * for a new Project, shaped per domain (Problem · Approach · Work · Reflection). Pure strings — they
 * are **never** validators: a Project whose body diverges from any template is still valid (no code
 * path parses a body against a template). The chosen name is recorded in frontmatter `template` for
 * reference only.
 *
 * `framing` (M1): the optional opening problem framing is woven once into the `## Problem` section.
 * When blank/omitted, Problem keeps its domain placeholder. The framing lives only here (creation);
 * it is never stored in the DB or frontmatter.
 */

export type ProjectTemplateName = "math/proof" | "cs/implement" | "freeform";

export const PROJECT_TEMPLATES: readonly ProjectTemplateName[] = ["math/proof", "cs/implement", "freeform"];

/** Per-template placeholder hints for each section (Problem's is replaced by `framing` when given). */
const SECTIONS: Record<ProjectTemplateName, { problem: string; approach: string; work: string; reflection: string }> = {
  "math/proof": {
    problem: "<!-- State the theorem / computation to establish. -->",
    approach: "<!-- Which definitions, lemmas, and milestones' capability apply? -->",
    work: "<!-- The proof or derivation — full steps, no skipped justification. -->",
    reflection: "<!-- Where did you get stuck? What did you have to look up? -->",
  },
  "cs/implement": {
    problem: "<!-- What are you building, and what must it do? -->",
    approach: "<!-- Design sketch, data structures, which milestones' capability applies. -->",
    work: "<!-- Code, commands, results — link files or paste key excerpts. -->",
    reflection: "<!-- What was hard? What would you do differently? What did you look up? -->",
  },
  freeform: {
    problem: "<!-- What concrete problem are you solving? -->",
    approach: "<!-- How will you tackle it? Which milestones' capability applies? -->",
    work: "<!-- The actual work: prose, code, proofs, diagrams, links. -->",
    reflection: "<!-- What did you learn? What was hard? What would you do differently? -->",
  },
};

export function renderTemplateBody(name: ProjectTemplateName | null, framing?: string | null): string {
  const s = SECTIONS[name ?? "freeform"] ?? SECTIONS.freeform;
  const problem = framing && framing.trim() ? framing.trim() : s.problem;
  return [
    `## Problem`,
    problem,
    ``,
    `## Approach`,
    s.approach,
    ``,
    `## Work`,
    s.work,
    ``,
    `## Reflection`,
    s.reflection,
    ``,
  ].join("\n");
}
