/**
 * Build the frontmatter object + render a fresh MOC body from a `MocModel`. Pure string
 * construction over the marker contract (markers.ts). The body shape rendered here is exactly
 * what `mergeMocBody` regenerates inside each marker pair, which is what makes merge idempotent
 * on app output.
 */

import {
  SECTION_ORDER,
  SECTION_HEADING,
  openMarker,
  closeMarker,
  REFLECTIONS_HEADING,
  REFLECTIONS_HINT,
  type ManagedSection,
} from "./markers";
import { renderMilestoneLine } from "./milestoneLine";
import type { MocModel } from "./model";

/** The frontmatter object written to every Course MOC (research R6). */
export function buildFrontmatter(model: MocModel): Record<string, unknown> {
  return {
    "cic-type": "course",
    "cic-id": model.id,
    title: model.title,
    domain: model.domain,
    campaign: model.campaign,
  };
}

/** The inner content for a section (the text between its markers). Empty for the skeleton
 *  sections this feature does not yet populate. */
function innerFor(section: ManagedSection, model: MocModel): string {
  if (section === "capability") return model.capability.trim();
  if (section === "milestones") return model.milestones.map(renderMilestoneLine).join("\n");
  return "";
}

/** `<!-- cic:x -->\n[inner\n]<!-- /cic:x -->` — the replaceable region (no heading). */
export function markerBlock(section: ManagedSection, model: MocModel): string {
  const inner = innerFor(section, model);
  return inner
    ? `${openMarker(section)}\n${inner}\n${closeMarker(section)}`
    : `${openMarker(section)}\n${closeMarker(section)}`;
}

/** A full section: `## Heading` + its marker block. */
export function renderSection(section: ManagedSection, model: MocModel): string {
  return `## ${SECTION_HEADING[section]}\n${markerBlock(section, model)}`;
}

/** The full MOC body for a brand-new file. */
export function renderMocBody(model: MocModel): string {
  const blocks = SECTION_ORDER.map((s) => renderSection(s, model)).join("\n\n");
  return `${blocks}\n\n## ${REFLECTIONS_HEADING}\n${REFLECTIONS_HINT}\n`;
}
