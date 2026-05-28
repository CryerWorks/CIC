/**
 * The MOC marker contract (research R2). The single source of truth for the app-managed
 * section names, their canonical order, headings, and the HTML-comment markers that delimit
 * the regions the app re-renders. Everything here is pure data — no I/O, no React, no db.
 *
 * Capability is marker-delimited like every other app-managed section (PRD v0.9.1) so the
 * merge/parse contract is uniform: the writer only ever rewrites the text *between* a pair of
 * markers, leaving headings, the user-owned `## Reflections` section, and any other prose
 * byte-identical.
 */

export type ManagedSection =
  | "capability"
  | "milestones"
  | "resources"
  | "projects"
  | "sessions"
  | "notes";

/** Render/scan order. Capability first, then the v0.7 sections. */
export const SECTION_ORDER: readonly ManagedSection[] = [
  "capability",
  "milestones",
  "resources",
  "projects",
  "sessions",
  "notes",
];

/** The `## Heading` text for each managed section (headings live *outside* the markers). */
export const SECTION_HEADING: Record<ManagedSection, string> = {
  capability: "Capability",
  milestones: "Milestones",
  resources: "Resources",
  projects: "Active Projects",
  sessions: "Recent Sessions",
  notes: "Notes",
};

export const openMarker = (s: ManagedSection): string => `<!-- cic:${s} -->`;
export const closeMarker = (s: ManagedSection): string => `<!-- /cic:${s} -->`;

/** The user-owned section the app never writes into. */
export const REFLECTIONS_HEADING = "Reflections";
export const REFLECTIONS_HINT = "<!-- user-owned — the app never writes here -->";
