/**
 * Feynman gaps repository (Feature 018). Tracks knowledge gaps identified by the Feynman/Socratic
 * Tutor across study sessions. Gaps get a dual write: the vault note (canonical) and this mirror
 * table (for fast query/reconciliation). The `reconcileCompleted` function scans vault note bodies
 * for `- [x]` checklist items under the `## Gaps from Feynman` heading and marks those gaps as
 * completed in the DB.
 */
import { z } from "zod";
import type { SqlExecutor } from "../executor";
import { selectParsed, insert } from "./query";

/** Input shape for inserting a gap row. */
export interface FeynmanGapInsert {
  id: string;
  vaultId: string;
  courseId: string | null;
  notePath: string;
  text: string;
}

/** Zod schema for feynman_gaps DB rows read back from SELECT. */
export const FeynmanGapRowSchema = z.object({
  id: z.string(),
  vault_id: z.string(),
  course_id: z.string().nullable(),
  note_path: z.string(),
  text: z.string(),
  status: z.enum(["open", "completed"]),
  created_at: z.string(),
});

export type FeynmanGapRow = z.infer<typeof FeynmanGapRowSchema>;

/** Row shape from the dashboard count query. */
export interface GapCountByCourse {
  courseId: string | null;
  courseTitle: string | null;
  count: number;
}

const GapCountRow = z.object({
  course_id: z.string().nullable(),
  course_title: z.string().nullable(),
  count: z.number().int().nonnegative(),
});

/** Batch-insert gaps. Each gap is a single row; all get status='open'. */
export async function insertGaps(
  db: SqlExecutor,
  gaps: FeynmanGapInsert[],
): Promise<void> {
  if (gaps.length === 0) return;
  for (const gap of gaps) {
    await insert(db, "feynman_gaps", {
      id: gap.id,
      vault_id: gap.vaultId,
      course_id: gap.courseId,
      note_path: gap.notePath,
      text: gap.text,
    });
  }
}

/** List all open (unresolved) gaps for a vault, newest first. */
export async function listOpenGaps(
  db: SqlExecutor,
  vaultId: string,
): Promise<FeynmanGapRow[]> {
  return selectParsed(
    db,
    FeynmanGapRowSchema,
    `SELECT * FROM feynman_gaps WHERE vault_id = ? AND status = 'open' ORDER BY created_at DESC`,
    [vaultId],
  );
}

/** Get open gap counts grouped by course (for the dashboard tile). Joins courses for the title.
 *  Gaps without a courseId are grouped under null. */
export async function getOpenGapCountByCourse(
  db: SqlExecutor,
  vaultId: string,
): Promise<GapCountByCourse[]> {
  const rows = await selectParsed(
    db,
    GapCountRow,
    `SELECT fg.course_id AS course_id, c.title AS course_title, COUNT(*) AS count
     FROM feynman_gaps fg
     LEFT JOIN courses c ON c.id = fg.course_id
     WHERE fg.vault_id = ? AND fg.status = 'open'
     GROUP BY fg.course_id
     ORDER BY count DESC`,
    [vaultId],
  );
  // Map snake_case rows to camelCase interface (following dashboard.ts pattern)
  return rows.map((r) => ({
    courseId: r.course_id,
    courseTitle: r.course_title,
    count: r.count,
  }));
}

/** Get total count of open gaps for a vault. */
export async function countOpenGaps(
  db: SqlExecutor,
  vaultId: string,
): Promise<number> {
  const rows = await db.select(
    `SELECT COUNT(*) AS n FROM feynman_gaps WHERE vault_id = ? AND status = 'open'`,
    [vaultId],
  );
  return (rows[0] as { n: number })?.n ?? 0;
}

/**
 * Reconcile gaps with the vault: scans open gaps to check if the corresponding vault note
 * has been updated (e.g., checklist items marked `- [x]`). Uses the provided `readNoteBody`
 * callback to read note bodies so this repository function stays decoupled from the vault
 * reader layer.
 *
 * Returns the number of gaps updated to `completed`.
 */
export async function reconcileCompleted(
  db: SqlExecutor,
  vaultId: string,
  readNoteBody: (notePath: string) => Promise<string | null>,
): Promise<number> {
  const gaps = await selectParsed(
    db,
    FeynmanGapRowSchema,
    `SELECT * FROM feynman_gaps WHERE vault_id = ? AND status = 'open'`,
    [vaultId],
  );
  if (gaps.length === 0) return 0;

  // Group by note_path to read each file only once.
  const byPath = new Map<string, FeynmanGapRow[]>();
  for (const g of gaps) {
    const group = byPath.get(g.note_path) ?? [];
    group.push(g);
    byPath.set(g.note_path, group);
  }

  const toComplete: string[] = [];
  for (const [notePath, fileGaps] of byPath) {
    const body = await readNoteBody(notePath);
    if (body === null) continue;

    const completedTexts = extractCompletedChecklistItems(body);
    if (completedTexts.length === 0) continue;

    for (const gap of fileGaps) {
      if (completedTexts.includes(gap.text)) {
        toComplete.push(gap.id);
      }
    }
  }

  if (toComplete.length === 0) return 0;

  const placeholders = toComplete.map(() => "?").join(", ");
  await db.execute(
    `UPDATE feynman_gaps SET status = 'completed' WHERE id IN (${placeholders}) AND status = 'open'`,
    toComplete,
  );
  return toComplete.length;
}

/**
 * Extract the text from `- [x]` checklist items found under the `## Gaps from Feynman` section
 * of a vault note body. Returns an empty array when no completed items are found.
 */
function extractCompletedChecklistItems(body: string): string[] {
  const items: string[] = [];

  const heading = "## Gaps from Feynman";
  const headingIdx = body.indexOf(heading);
  if (headingIdx === -1) return items;

  // Skip past the heading line to reach section content
  const afterNewline = body.indexOf("\n", headingIdx);
  const startContent = afterNewline === -1 ? body.length : afterNewline + 1;

  // Section ends at the next `#`-level heading (any depth) or end of file
  const remaining = body.slice(startContent);
  let endIdx = remaining.length;
  const nextHeading = remaining.search(/\n#{1,3}\s/);
  if (nextHeading !== -1) {
    endIdx = nextHeading;
  }

  const section = remaining.slice(0, endIdx);

  // Match `- [x]` checklist items (case-insensitive on the [x])
  const regex = /^\s*-\s*\[x\]\s+(.+)$/gim;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(section)) !== null) {
    items.push(match[1].trim());
  }

  return items;
}
