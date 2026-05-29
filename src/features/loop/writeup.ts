import type { NoteInput } from "../../vault";

/**
 * Pure builder for the session writeup note (PRD §F7, `type: log`) and its vault path. No I/O — the
 * caller hands the result to `VaultWriter.writeNote`. Empty sections are omitted so the note stays
 * clean Markdown a person would be happy to keep (Constitution I). Pretest attempts are recorded
 * verbatim and never scored (Constitution III).
 */

export interface WriteupData {
  /** ISO timestamp of the session. */
  date: string;
  courseTitle: string;
  objective: string;
  pretest: { question: string; userResponse: string | null }[];
  /** `label` = resource title + kind, e.g. "Baby Rudin (read)". */
  assignments: { label: string; locator: string | null }[];
  retrievalText: string;
  selfTestText: string;
  cardsMade: { front: string; back: string }[];
  notePath: string | null;
}

const dateOnly = (iso: string): string => iso.slice(0, 10);

/** An Obsidian wikilink from a note path: drop the folder + `.md`. */
function noteLink(path: string): string {
  const base = path.replace(/\.md$/i, "");
  return `[[${base.slice(base.lastIndexOf("/") + 1)}]]`;
}

export function buildWriteup(data: WriteupData): NoteInput {
  const sections: string[] = [`# Session — ${dateOnly(data.date)}`, `**Objective:** ${data.objective}`];

  if (data.pretest.length > 0) {
    const lines = data.pretest.map(
      (p) => `- **Q:** ${p.question}\n  - ${p.userResponse?.trim() ? p.userResponse.trim() : "(no answer)"}`,
    );
    sections.push(`## Pretest — what I thought\n${lines.join("\n")}`);
  }
  if (data.assignments.length > 0) {
    const lines = data.assignments.map((a) => `- ${a.label}${a.locator?.trim() ? ` — ${a.locator.trim()}` : ""}`);
    sections.push(`## Studied\n${lines.join("\n")}`);
  }
  if (data.retrievalText.trim()) sections.push(`## Recalled from memory\n${data.retrievalText.trim()}`);
  if (data.selfTestText.trim()) sections.push(`## Self-test / gaps\n${data.selfTestText.trim()}`);
  if (data.cardsMade.length > 0) {
    sections.push(`## Cards made\n${data.cardsMade.map((c) => `- ${c.front} → ${c.back}`).join("\n")}`);
  }
  if (data.notePath) sections.push(`## Note\n${noteLink(data.notePath)}`);

  return {
    frontmatter: { type: "log", date: dateOnly(data.date), course: data.courseTitle, objective: data.objective },
    body: sections.join("\n\n"),
  };
}

/** `Sessions/<YYYY-MM-DD> <objective-slug> (<short-id>).md` — the short id makes the path
 *  collision-free for two same-day sessions, so the finish write is a clean first-write (R6). */
export function writeupPath(date: string, objective: string, sessionId: string): string {
  const slug =
    objective
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "session";
  return `Sessions/${dateOnly(date)} ${slug} (${sessionId.slice(0, 8)}).md`;
}
