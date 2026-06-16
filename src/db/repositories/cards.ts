import type { SqlExecutor } from "../executor";
import { CardSchema, type Card } from "../models/card";
import { insert, selectParsed, update } from "./query";
import { getSetting } from "./settings";

/** The daily new-card cap setting key + default (FR-012 / R4). */
export const NEW_CARD_CAP_KEY = "srs.dailyNewCap";
export const DEFAULT_NEW_CARD_CAP = 20;

/** The configured daily new-card cap, or the default when unset/invalid. */
export async function getNewCardCap(db: SqlExecutor): Promise<number> {
  const raw = await getSetting(db, NEW_CARD_CAP_KEY);
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULT_NEW_CARD_CAP;
}

/**
 * SRS card repository (Feature 010). Cards are vault-scoped transitively through their Course
 * (`card → course → domain.vault_id`, Feature 009) — there is no `vault_id` on `cards`. The
 * `front`/`back` are sanctioned SRS artifacts (PRD §8) — the only knowledge content stored
 * outside the vault. Scheduling state lives in `fsrs_state` (owned by the FSRS engine); a card
 * with `fsrs_state IS NULL` has never been reviewed and is **new**.
 */

export async function createCard(
  db: SqlExecutor,
  input: { courseId: string; front: string; back: string; notePath?: string | null; projectId?: string | null },
): Promise<Card> {
  const row: Card = {
    id: crypto.randomUUID(),
    course_id: input.courseId,
    project_id: input.projectId ?? null,
    note_path: input.notePath ?? null,
    note_block_id: null,
    front: input.front,
    back: input.back,
    fsrs_state: null,
    due_at: null,
    last_reviewed: null,
    created_at: new Date().toISOString(),
  };
  await insert(db, "cards", row);
  return CardSchema.parse(row);
}

/**
 * Default back text for cards that were created before backs were required.
 * This ensures existing data doesn't break when displayed.
 */
const LEGACY_CARD_BACK_PLACEHOLDER = "[back not yet provided]";

/**
 * Ensure a card has a meaningful back field. If the card's back is empty or
 * whitespace-only (legacy cards created before backs were required), returns
 * the placeholder text.
 */
export function ensureCardBack(back: string): string {
  return back.trim().length > 0 ? back : LEGACY_CARD_BACK_PLACEHOLDER;
}

export async function getCard(db: SqlExecutor, id: string): Promise<Card | null> {
  const rows = await selectParsed(db, CardSchema, "SELECT * FROM cards WHERE id = ?", [id]);
  return rows[0] ?? null;
}

/** Cards on a Course (the Course-detail listing), newest first. */
export async function listCardsByCourse(db: SqlExecutor, courseId: string): Promise<Card[]> {
  return selectParsed(
    db,
    CardSchema,
    "SELECT * FROM cards WHERE course_id = ? ORDER BY created_at DESC",
    [courseId],
  );
}

/** Patch a card's content/links. NEVER touches `fsrs_state`/`due_at`/`last_reviewed` (FR-011) —
 *  editing a card's wording must not reset its schedule. */
export async function updateCardContent(
  db: SqlExecutor,
  id: string,
  patch: { front?: string; back?: string; notePath?: string | null; noteBlockId?: string | null },
): Promise<Card> {
  const set: Record<string, unknown> = {};
  if (patch.front !== undefined) set.front = patch.front;
  if (patch.back !== undefined) set.back = patch.back;
  if (patch.notePath !== undefined) set.note_path = patch.notePath;
  if (patch.noteBlockId !== undefined) set.note_block_id = patch.noteBlockId;
  if (Object.keys(set).length > 0) await update(db, "cards", set, { id });
  const card = await getCard(db, id);
  if (!card) throw new Error(`Card ${id} not found`);
  return card;
}

/** Delete a card. `ON DELETE CASCADE` removes its `reviews` and `card_resources` (FR-024). */
export async function deleteCard(db: SqlExecutor, id: string): Promise<void> {
  await db.execute("DELETE FROM cards WHERE id = ?", [id]);
}

const VAULT_JOIN = `JOIN courses co ON co.id = c.course_id JOIN domains d ON d.id = co.domain_id`;

/** Count of *new* cards (never reviewed) first introduced on `now`'s calendar day, in this vault —
 *  i.e. cards whose earliest review timestamp falls today. Drives the daily new-card cap (R4). */
async function newIntroducedToday(db: SqlExecutor, vaultId: string, now: string): Promise<number> {
  const rows = await db.select<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT r.card_id, MIN(r.reviewed_at) AS first_review
       FROM reviews r
       JOIN cards c ON c.id = r.card_id ${VAULT_JOIN}
       WHERE d.vault_id = ?
       GROUP BY r.card_id
       HAVING substr(first_review, 1, 10) = substr(?, 1, 10)
     )`,
    [vaultId, now],
  );
  return rows[0]?.n ?? 0;
}

/**
 * The due queue for the active vault (R5): all due **review** cards (`fsrs_state` set,
 * `due_at <= now`) ordered by `due_at`, then **new** cards (`fsrs_state IS NULL`) ordered by
 * `created_at`, capped to `cap − newIntroducedToday` so a freshly-authored batch doesn't flood
 * the session. A card with malformed `fsrs_state` JSON is selected as a new card here (its blob
 * fails validation at review time and is re-initialized — FR-021), never dropped.
 */
export async function listDueCards(
  db: SqlExecutor,
  vaultId: string,
  now: string,
  cap: number,
): Promise<Card[]> {
  const due = await selectParsed(
    db,
    CardSchema,
    `SELECT c.* FROM cards c ${VAULT_JOIN}
     WHERE d.vault_id = ? AND c.fsrs_state IS NOT NULL AND c.due_at <= ?
     ORDER BY c.due_at ASC`,
    [vaultId, now],
  );
  const remaining = Math.max(0, cap - (await newIntroducedToday(db, vaultId, now)));
  if (remaining === 0) return due;
  const fresh = await selectParsed(
    db,
    CardSchema,
    `SELECT c.* FROM cards c ${VAULT_JOIN}
     WHERE d.vault_id = ? AND c.fsrs_state IS NULL
     ORDER BY c.created_at ASC
     LIMIT ?`,
    [vaultId, remaining],
  );
  return [...due, ...fresh];
}

/** Size of the due queue — for the dashboard tile. */
export async function countDueCards(
  db: SqlExecutor,
  vaultId: string,
  now: string,
  cap: number,
): Promise<number> {
  return (await listDueCards(db, vaultId, now, cap)).length;
}
