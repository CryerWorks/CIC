// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import {
  createCard,
  getCard,
  listCardsByCourse,
  listDueCards,
  countDueCards,
  updateCardContent,
  deleteCard,
} from "./cards";

const VID = "vault-1";
const NOW = "2026-05-28T12:00:00.000Z";

async function setup() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/v1" });
  const domain = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Real Analysis", domainId: domain.id });
  return { db, domain, course };
}

/** Force a card into a scheduled (reviewed) state + log a review at `reviewedAt`. */
async function schedule(db: NodeSqlExecutor, id: string, dueAt: string, reviewedAt: string) {
  const state = JSON.stringify({
    due: dueAt, stability: 2, difficulty: 5, elapsed_days: 0,
    scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: reviewedAt,
  });
  await db.execute("UPDATE cards SET fsrs_state = ?, due_at = ?, last_reviewed = ? WHERE id = ?", [
    state, dueAt, reviewedAt, id,
  ]);
  await db.execute(
    "INSERT INTO reviews (id, card_id, rating, confidence, reviewed_at, elapsed_ms) VALUES (?, ?, 'good', 3, ?, NULL)",
    [crypto.randomUUID(), id, reviewedAt],
  );
}

describe("cards repo", () => {
  it("createCard makes a new (unscheduled) card", async () => {
    const { db, course } = await setup();
    const card = await createCard(db, { courseId: course.id, front: "Q", back: "A" });
    expect(card.fsrs_state).toBeNull();
    expect(card.due_at).toBeNull();
    expect((await getCard(db, card.id))?.front).toBe("Q");
    expect(await listCardsByCourse(db, course.id)).toHaveLength(1);
  });

  it("updateCardContent edits wording without resetting the schedule (FR-011)", async () => {
    const { db, course } = await setup();
    const card = await createCard(db, { courseId: course.id, front: "Q", back: "A" });
    await schedule(db, card.id, "2099-01-01T00:00:00.000Z", "2026-05-28T00:00:00.000Z");
    const updated = await updateCardContent(db, card.id, { front: "Q2" });
    expect(updated.front).toBe("Q2");
    expect(updated.due_at).toBe("2099-01-01T00:00:00.000Z");
    expect(updated.fsrs_state).not.toBeNull();
  });

  it("listDueCards: due review cards + capped new cards (none introduced today)", async () => {
    const { db, course } = await setup();
    const due = await createCard(db, { courseId: course.id, front: "due", back: "x" });
    await schedule(db, due.id, "2026-05-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z"); // past → due
    const future = await createCard(db, { courseId: course.id, front: "future", back: "x" });
    await schedule(db, future.id, "2099-01-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z"); // not due
    for (let i = 0; i < 5; i++) await createCard(db, { courseId: course.id, front: `new${i}`, back: "x" });

    const q = await listDueCards(db, VID, NOW, 3);
    expect(q.filter((c) => c.fsrs_state !== null)).toHaveLength(1); // only the past-due review card
    expect(q.filter((c) => c.fsrs_state === null)).toHaveLength(3); // new cards capped at 3
    expect(await countDueCards(db, VID, NOW, 3)).toBe(4);
  });

  it("daily cap shrinks by the new cards already introduced today (R4)", async () => {
    const { db, course } = await setup();
    const a = await createCard(db, { courseId: course.id, front: "a", back: "x" });
    const b = await createCard(db, { courseId: course.id, front: "b", back: "x" });
    await schedule(db, a.id, "2099-01-01T00:00:00.000Z", "2026-05-28T08:00:00.000Z"); // introduced today
    await schedule(db, b.id, "2099-01-01T00:00:00.000Z", "2026-05-28T09:00:00.000Z"); // introduced today
    for (let i = 0; i < 5; i++) await createCard(db, { courseId: course.id, front: `new${i}`, back: "x" });

    const q = await listDueCards(db, VID, NOW, 3); // cap 3 − 2 introduced today = 1 new; no due reviews (both future)
    expect(q).toHaveLength(1);
    expect(q[0].fsrs_state).toBeNull();
  });

  it("scopes the queue to the active vault", async () => {
    const { db, course } = await setup();
    const VID2 = "vault-2";
    await attachVault(db, { id: VID2, path: "/v2" });
    const d2 = await createDomain(db, VID2, { name: "Physics", color: "#22d3ee" });
    const c2 = await createCourse(db, { title: "Mechanics", domainId: d2.id });
    await createCard(db, { courseId: c2.id, front: "v2", back: "x" });
    await createCard(db, { courseId: course.id, front: "v1", back: "x" });

    const q = await listDueCards(db, VID, NOW, 20);
    expect(q).toHaveLength(1);
    expect(q[0].front).toBe("v1");
  });

  it("deleting a card cascades its reviews (FR-024)", async () => {
    const { db, course } = await setup();
    const card = await createCard(db, { courseId: course.id, front: "Q", back: "A" });
    await schedule(db, card.id, "2026-05-01T00:00:00.000Z", "2026-05-28T00:00:00.000Z");
    await deleteCard(db, card.id);
    expect(await getCard(db, card.id)).toBeNull();
    expect(await db.select("SELECT * FROM reviews WHERE card_id = ?", [card.id])).toHaveLength(0);
  });

  it("a card with malformed-shape fsrs_state but a due date still surfaces, not dropped (FR-021)", async () => {
    const { db, course } = await setup();
    const card = await createCard(db, { courseId: course.id, front: "Q", back: "A" });
    await db.execute("UPDATE cards SET fsrs_state = ?, due_at = ? WHERE id = ?", [
      '{"garbage":true}', "2026-05-01T00:00:00.000Z", card.id,
    ]);
    const q = await listDueCards(db, VID, NOW, 20);
    expect(q.map((c) => c.id)).toContain(card.id);
  });
});
