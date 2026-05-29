import { describe, it, expect } from "vitest";
import { createScheduler } from "./scheduler";
import { SchedulingStateSchema } from "./schedulingState";
import type { Grade } from "./types";

const NOW = new Date("2026-05-28T12:00:00.000Z");
const GRADES: Grade[] = ["again", "hard", "good", "easy"];

describe("Scheduler (FSRS engine seam)", () => {
  it("initial() yields a valid new-card state", () => {
    const state = createScheduler().initial(NOW);
    expect(SchedulingStateSchema.safeParse(state).success).toBe(true);
    expect(state.reps).toBe(0);
    expect(state.state).toBe(0); // New
  });

  it("grades a new card (prev=null) with no NaN/invalid dates and a valid state", () => {
    const r = createScheduler().grade(null, "good", NOW);
    expect(Number.isNaN(Date.parse(r.due))).toBe(false);
    expect(Number.isNaN(Date.parse(r.lastReview))).toBe(false);
    expect(SchedulingStateSchema.safeParse(r.state).success).toBe(true);
  });

  it("reschedules monotonically by grade (SC-002): again ≤ hard ≤ good < easy, again < easy", () => {
    const s = createScheduler();
    const due = (g: Grade) => Date.parse(s.grade(null, g, NOW).due);
    expect(due("again")).toBeLessThanOrEqual(due("hard"));
    expect(due("hard")).toBeLessThanOrEqual(due("good"));
    expect(due("good")).toBeLessThan(due("easy"));
    expect(due("again")).toBeLessThan(due("easy"));
  });

  it("is deterministic for the same (prev, grade, now)", () => {
    const s = createScheduler();
    expect(s.grade(null, "good", NOW)).toEqual(s.grade(null, "good", NOW));
  });

  it("round-trips: a graded state re-grades from its own persisted output", () => {
    const s = createScheduler();
    const first = s.grade(null, "good", NOW);
    const later = new Date(Date.parse(first.due) + 1000);
    const second = s.grade(first.state, "good", later);
    expect(SchedulingStateSchema.safeParse(second.state).success).toBe(true);
    expect(second.state.reps).toBeGreaterThan(first.state.reps);
  });

  it("preview() returns four parseable due dates", () => {
    const p = createScheduler().preview(null, NOW);
    GRADES.forEach((g) => expect(Number.isNaN(Date.parse(p[g]))).toBe(false));
  });
});
