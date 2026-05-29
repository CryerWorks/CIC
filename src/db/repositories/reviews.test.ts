// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import { createCard } from "./cards";
import { recordReview, listReviewsByCard, getOverconfidentCards, hasReviewOnDay } from "./reviews";
import { createScheduler } from "../../features/srs/fsrs/scheduler";

const VID = "vault-1";
const NOW = "2026-05-28T12:00:00.000Z";
const scheduler = createScheduler();

async function setup() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/v1" });
  const domain = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Real Analysis", domainId: domain.id });
  return { db, course };
}

describe("reviews repo — recordReview", () => {
  it("advances the schedule and logs the review atomically (new card first review)", async () => {
    const { db, course } = await setup();
    const card = await createCard(db, { courseId: course.id, front: "Q", back: "A" });

    const { card: after, review } = await recordReview(db, scheduler, {
      cardId: card.id, grade: "good", confidence: 3, now: NOW,
    });

    expect(after.fsrs_state).not.toBeNull();
    expect(after.due_at).not.toBeNull();
    expect(after.last_reviewed).toBe(NOW);
    expect(review.rating).toBe("good");
    expect(review.confidence).toBe(3);
    expect(await listReviewsByCard(db, card.id)).toHaveLength(1);
  });

  it("logs each grade's due monotonically (again sooner than easy)", async () => {
    const { db, course } = await setup();
    const c1 = await createCard(db, { courseId: course.id, front: "a", back: "x" });
    const c2 = await createCard(db, { courseId: course.id, front: "b", back: "x" });

    const again = await recordReview(db, scheduler, { cardId: c1.id, grade: "again", confidence: 1, now: NOW });
    const easy = await recordReview(db, scheduler, { cardId: c2.id, grade: "easy", confidence: 5, now: NOW });

    expect(Date.parse(again.card.due_at as string)).toBeLessThan(Date.parse(easy.card.due_at as string));
  });

  it("re-initializes a card with malformed fsrs_state and reviews without throwing (FR-021)", async () => {
    const { db, course } = await setup();
    const card = await createCard(db, { courseId: course.id, front: "Q", back: "A" });
    await db.execute("UPDATE cards SET fsrs_state = ?, due_at = ? WHERE id = ?", [
      '{"garbage":true}', "2026-01-01T00:00:00.000Z", card.id,
    ]);

    const { card: after } = await recordReview(db, scheduler, {
      cardId: card.id, grade: "good", confidence: 3, now: NOW,
    });

    expect(after.fsrs_state).not.toBeNull();
    expect(after.due_at).not.toBeNull();
    expect(await listReviewsByCard(db, card.id)).toHaveLength(1);
  });
});

describe("getOverconfidentCards (US3 · F3.5)", () => {
  it("selects cards whose latest review is high-confidence + 'again', not others", async () => {
    const { db, course } = await setup();
    const over = await createCard(db, { courseId: course.id, front: "over", back: "x" });
    const fine = await createCard(db, { courseId: course.id, front: "fine", back: "x" });
    await recordReview(db, scheduler, { cardId: over.id, grade: "again", confidence: 5, now: NOW });
    await recordReview(db, scheduler, { cardId: fine.id, grade: "good", confidence: 4, now: NOW });

    expect((await getOverconfidentCards(db, VID)).map((c) => c.front)).toEqual(["over"]);
  });

  it("uses only the latest review, not historical ones", async () => {
    const { db, course } = await setup();
    const card = await createCard(db, { courseId: course.id, front: "c", back: "x" });
    await recordReview(db, scheduler, { cardId: card.id, grade: "again", confidence: 5, now: "2026-05-28T08:00:00.000Z" });
    await recordReview(db, scheduler, { cardId: card.id, grade: "good", confidence: 3, now: "2026-05-28T12:00:00.000Z" });

    expect(await getOverconfidentCards(db, VID)).toHaveLength(0);
  });

  it("is scoped to the active vault", async () => {
    const { db } = await setup();
    const VID2 = "vault-2";
    await attachVault(db, { id: VID2, path: "/v2" });
    const d2 = await createDomain(db, VID2, { name: "Physics", color: "#22d3ee" });
    const c2 = await createCourse(db, { title: "Mechanics", domainId: d2.id });
    const other = await createCard(db, { courseId: c2.id, front: "v2-over", back: "x" });
    await recordReview(db, scheduler, { cardId: other.id, grade: "again", confidence: 5, now: NOW });

    expect(await getOverconfidentCards(db, VID)).toHaveLength(0);
    expect((await getOverconfidentCards(db, VID2)).map((c) => c.front)).toEqual(["v2-over"]);
  });
});

describe("hasReviewOnDay (Feature 014 — practiced-today signal)", () => {
  it("is true only for a day with a review in the active vault", async () => {
    const { db, course } = await setup();
    const card = await createCard(db, { courseId: course.id, front: "Q", back: "A" });
    await recordReview(db, scheduler, { cardId: card.id, grade: "good", confidence: 3, now: NOW });

    expect(await hasReviewOnDay(db, VID, "2026-05-28")).toBe(true); // NOW's day
    expect(await hasReviewOnDay(db, VID, "2026-05-29")).toBe(false);
    expect(await hasReviewOnDay(db, "vault-2", "2026-05-28")).toBe(false); // other vault
  });
});
