/**
 * `mergeMocBody` — update an existing MOC body's app-managed sections while preserving every
 * other byte (research R4). For each managed section: if its marker pair is present, replace
 * only the text between the markers with freshly rendered content; if absent, re-insert the
 * full section before `## Reflections` (or at end). Malformed (open without close) → left
 * untouched. Headings, `## Reflections`, and any out-of-marker prose are never altered.
 *
 * Invariant: `mergeMocBody(renderMocBody(m), m) === renderMocBody(m)`.
 */

import {
  SECTION_ORDER,
  REFLECTIONS_HEADING,
  openMarker,
  closeMarker,
  type ManagedSection,
} from "./markers";
import { markerBlock, renderSection } from "./render";
import type { MocModel } from "./model";

type Replacement = string | "absent" | "unterminated";

function replaceBlock(body: string, section: ManagedSection, model: MocModel): Replacement {
  const open = openMarker(section);
  const close = closeMarker(section);
  const oi = body.indexOf(open);
  if (oi === -1) return "absent";
  const ci = body.indexOf(close, oi + open.length);
  if (ci === -1) return "unterminated";
  const end = ci + close.length;
  return body.slice(0, oi) + markerBlock(section, model) + body.slice(end);
}

function insertSection(body: string, section: ManagedSection, model: MocModel): string {
  const block = renderSection(section, model);
  const refIdx = body.indexOf(`## ${REFLECTIONS_HEADING}`);
  if (refIdx !== -1) {
    return `${body.slice(0, refIdx)}${block}\n\n${body.slice(refIdx)}`;
  }
  return `${body.replace(/\s*$/, "")}\n\n${block}\n`;
}

export function mergeMocBody(existingBody: string, model: MocModel): string {
  let body = existingBody;
  for (const section of SECTION_ORDER) {
    const result = replaceBlock(body, section, model);
    if (result === "unterminated") continue; // leave malformed user markup untouched
    body = result === "absent" ? insertSection(body, section, model) : result;
  }
  return body;
}
