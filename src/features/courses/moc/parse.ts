/**
 * `parseMocBody` — read the app-managed sections back out of a MOC body (read-back, research
 * R7). Extracts the capability paragraph and the milestone lines. Returns a `MocParseError`
 * only when a marker is opened but never closed (the body looked like a CIC MOC but is broken);
 * a simply-empty or absent section is fine.
 */

import { openMarker, closeMarker, type ManagedSection } from "./markers";
import { parseMilestoneLine } from "./milestoneLine";
import { MocParseError, type ParsedMoc, type ParsedMilestoneLine } from "./model";

type Slice = { inner: string } | "absent" | "unterminated";

/** The text between a section's markers, or a sentinel. Shared by parse (here) and the merge
 *  conflict check. */
export function sliceInner(body: string, section: ManagedSection): Slice {
  const open = openMarker(section);
  const close = closeMarker(section);
  const oi = body.indexOf(open);
  if (oi === -1) return "absent";
  const ci = body.indexOf(close, oi + open.length);
  if (ci === -1) return "unterminated";
  return { inner: body.slice(oi + open.length, ci) };
}

export function parseMocBody(body: string): ParsedMoc | MocParseError {
  const cap = sliceInner(body, "capability");
  if (cap === "unterminated") return new MocParseError("`cic:capability` opened but not closed");
  const capability = cap === "absent" ? "" : cap.inner.trim();

  const ms = sliceInner(body, "milestones");
  if (ms === "unterminated") return new MocParseError("`cic:milestones` opened but not closed");

  const milestones: ParsedMilestoneLine[] = [];
  if (ms !== "absent") {
    for (const raw of ms.inner.split("\n")) {
      const parsed = parseMilestoneLine(raw);
      if (parsed) milestones.push(parsed); // null → not a task-list line, skip
    }
  }

  return { capability, milestones };
}
