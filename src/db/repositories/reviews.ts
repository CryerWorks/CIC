import type { SqlExecutor } from "../executor";
import { ReviewSchema, type Review } from "../models/review";
import { CardSchema, type Card } from "../models/card";
import { SchedulingStateSchema, type SchedulingState } from "../../features/srs/fsrs/schedulingState";
import type { Grade } from "../../features/srs/fsrs/types";
import type { Scheduler } from "../../features/srs/fsrs/scheduler";
import { getCard } from "./cards";
import { insert, selectParsed, update } from "./query";

/**
 * Review log + the review transaction (Feature 010). Recording a review advances the card's
 * FSRS state and appends an immutable `reviews` row **atomically** (R12) — a crash must never
 * leave a card rescheduled without a logged review (SC-003), or vice-versa.
 */

/** A card's stored state, or `null` if absent OR malformed — a non-conforming blob is treated
 *  as a new card and re-initialized by the scheduler (FR-021), never a thrown error. */
function parseState(raw: Card["fsrs_state"]): SchedulingState | null {
  if (raw === null || raw === undefined) return null;
  const parsed = SchedulingStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function recordReview(
  db: SqlExecutor,
  scheduler: Scheduler,
  input: { cardId: string; grade: Grade; confidence: number; elapsedMs?: number | null; now?: string },
): Promise<{ card: Card; review: Review }> {
  const now = input.now ?? new Date().toISOString();
  return db.transaction(async (tx) => {
    const card = await getCard(tx, input.cardId);
    if (!card) throw new Error(`Card ${input.cardId} not found`);

    const result = scheduler.grade(parseState(card.fsrs_state), input.grade, new Date(now));
    await update(
      tx,
      "cards",
      { fsrs_state: result.state, due_at: result.due, last_reviewed: result.lastReview },
      { id: input.cardId },
    );

    const review: Review = {
      id: crypto.randomUUID(),
      card_id: input.cardId,
      rating: input.grade,
      confidence: input.confidence,
      reviewed_at: now,
      elapsed_ms: input.elapsedMs ?? null,
    };
    await insert(tx, "reviews", review);

    const updated = await getCard(tx, input.cardId);
    if (!updated) throw new Error(`Card ${input.cardId} vanished mid-review`);
    return { card: updated, review: ReviewSchema.parse(review) };
  });
}

/** Whether the active vault has any review recorded on `dayPrefix` (`YYYY-MM-DD`) — the Feature-014
 *  "practiced today" suppression signal (vault-scoped via `card → course → domain`). */
export async function hasReviewOnDay(
  db: SqlExecutor,
  vaultId: string,
  dayPrefix: string,
): Promise<boolean> {
  const rows = await db.select<{ n: number }>(
    `SELECT EXISTS(
       SELECT 1 FROM reviews r
       JOIN cards c ON c.id = r.card_id
       JOIN courses co ON co.id = c.course_id
       JOIN domains d ON d.id = co.domain_id
       WHERE d.vault_id = ? AND substr(r.reviewed_at, 1, 10) = ?
     ) AS n`,
    [vaultId, dayPrefix],
  );
  return (rows[0]?.n ?? 0) === 1;
}

export async function listReviewsByCard(db: SqlExecutor, cardId: string): Promise<Review[]> {
  return selectParsed(
    db,
    ReviewSchema,
    "SELECT * FROM reviews WHERE card_id = ? ORDER BY reviewed_at ASC",
    [cardId],
  );
}

/**
 * Cards in the active vault whose **most recent** review was high-confidence yet failed —
 * `confidence >= 4 AND rating = 'again'` (F3.5 calibration / R11). This is where the illusion of
 * competence concentrates. Vault-scoped via the `card → course → domain.vault_id` join; most
 * recent first.
 */
export async function getOverconfidentCards(db: SqlExecutor, vaultId: string): Promise<Card[]> {
  return selectParsed(
    db,
    CardSchema,
    `SELECT c.* FROM cards c
     JOIN courses co ON co.id = c.course_id
     JOIN domains d ON d.id = co.domain_id
     JOIN reviews r ON r.id = (
       SELECT r2.id FROM reviews r2 WHERE r2.card_id = c.id
       ORDER BY r2.reviewed_at DESC, r2.id DESC LIMIT 1
     )
     WHERE d.vault_id = ? AND r.confidence >= 4 AND r.rating = 'again'
     ORDER BY r.reviewed_at DESC`,
    [vaultId],
  );
}
