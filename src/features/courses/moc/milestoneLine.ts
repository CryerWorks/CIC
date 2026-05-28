/**
 * Render + parse a single Milestone line (research R3). Faithful 3-state round-trip: the
 * checkbox glyph mirrors status for humans (`[ ]` todo, `[/]` in-progress, `[x]` done), and a
 * trailing HTML comment carries the *authoritative* id + status (invisible in Obsidian's
 * reading view). A line inside the milestones block without a valid comment is treated as a
 * user-added milestone (`id: null`, status inferred from the checkbox).
 */

import { milestoneStatus, type MilestoneStatus } from "../../../db/models/enums";
import type { MocMilestoneModel, ParsedMilestoneLine } from "./model";

const GLYPH: Record<MilestoneStatus, string> = {
  todo: " ",
  "in-progress": "/",
  done: "x",
};

function glyphToStatus(glyph: string): MilestoneStatus {
  if (glyph === "x" || glyph === "X") return "done";
  if (glyph === "/") return "in-progress";
  return "todo";
}

/** `- [ ] <capability> <!-- cic:m id=<id> status=<status> -->` */
export function renderMilestoneLine(m: MocMilestoneModel): string {
  return `- [${GLYPH[m.status]}] ${m.capability} <!-- cic:m id=${m.id} status=${m.status} -->`;
}

const TASK_RE = /^- \[(.)\]\s?(.*)$/;
const COMMENT_RE = /<!--\s*cic:m\s+id=(\S+)\s+status=(\S+)\s*-->/;

/** Parse one line. Returns `null` if the line is not a markdown task-list item (skip it). */
export function parseMilestoneLine(line: string): ParsedMilestoneLine | null {
  const task = TASK_RE.exec(line.trim());
  if (!task) return null;

  const glyph = task[1];
  let rest = task[2];

  const comment = COMMENT_RE.exec(rest);
  if (comment) {
    const id = comment[1];
    const parsedStatus = milestoneStatus.safeParse(comment[2]);
    const status: MilestoneStatus = parsedStatus.success ? parsedStatus.data : glyphToStatus(glyph);
    const capability = rest.slice(0, comment.index).trim();
    return { id, capability, status };
  }

  return { id: null, capability: rest.trim(), status: glyphToStatus(glyph) };
}
