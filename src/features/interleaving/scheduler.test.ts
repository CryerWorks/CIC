// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { NodeSqlExecutor } from "../../db/adapters/node";
import { migrate } from "../../db/migrate";
import { attachVault } from "../../db/repositories/vaults";
import { createDomain } from "../../db/repositories/domains";
import { createCourse } from "../../db/repositories/courses";
import { addDependency } from "../../db/repositories/courseDependencies";
import { setSetting } from "../../db/repositories/settings";
import { DEFAULT_COLD_DAYS, getColdThreshold, getDailyMix, getColdDomains, respectsPrereqs } from "./scheduler";

const VID = "vault-interleaving";

/** Helper: insert a planned session for today. */
async function planSessionToday(
  db: NodeSqlExecutor,
  courseId: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  await db.execute(
    `INSERT INTO sessions (id, course_id, date, minutes, did_retrieval, status, order_index)
     VALUES (?, ?, ?, 0, 0, 'planned', 0)`,
    [id, courseId, today],
  );
  return id;
}

/** Helper: create a completed session on a given day prefix. */
async function completeSession(
  db: NodeSqlExecutor,
  courseId: string,
  completedAt: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO sessions (id, course_id, date, minutes, did_retrieval, status, completed_at, order_index)
     VALUES (?, ?, ?, 30, 1, 'completed', ?, 0)`,
    [id, courseId, completedAt, completedAt],
  );
  return id;
}

/** Helper: create a due review card. */
async function createDueCard(
  db: NodeSqlExecutor,
  courseId: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cards (id, course_id, front, back, fsrs_state, due_at, created_at)
     VALUES (?, ?, 'front', 'back', '{}', ?, ?)`,
    [id, courseId, now, now],
  );
  return id;
}

describe("interleaving scheduler (F6 / T003+T004)", () => {
  let db: NodeSqlExecutor;
  let math: { id: string };
  let physics: { id: string };
  let algebra: { id: string };
  let calculus: { id: string };
  let mechanics: { id: string };
  let thermo: { id: string };

  beforeEach(async () => {
    db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });

    math = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    physics = await createDomain(db, VID, { name: "Physics", color: "#ef6c8b" });

    algebra = await createCourse(db, { title: "Algebra", domainId: math.id });
    calculus = await createCourse(db, { title: "Calculus", domainId: math.id });
    mechanics = await createCourse(db, { title: "Mechanics", domainId: physics.id });
    thermo = await createCourse(db, { title: "Thermodynamics", domainId: physics.id });
  });

  // -----------------------------------------------------------------------
  // getColdThreshold
  // -----------------------------------------------------------------------
  describe("getColdThreshold", () => {
    it("returns the default when unset", async () => {
      expect(await getColdThreshold(db)).toBe(DEFAULT_COLD_DAYS);
    });

    it("reads a custom value from settings", async () => {
      await setSetting(db, "interleaving.coldDays", "3");
      expect(await getColdThreshold(db)).toBe(3);
    });

    it("falls back to default when the stored value is NaN", async () => {
      await setSetting(db, "interleaving.coldDays", "not-a-number");
      expect(await getColdThreshold(db)).toBe(DEFAULT_COLD_DAYS);
    });
  });

  // -----------------------------------------------------------------------
  // respectsPrereqs
  // -----------------------------------------------------------------------
  describe("respectsPrereqs", () => {
    it("returns true when a course has no declared prereqs", async () => {
      expect(await respectsPrereqs(db, algebra.id)).toBe(true);
    });

    it("returns true when all prereqs have at least one completed session", async () => {
      await addDependency(db, { courseId: calculus.id, prereqCourseId: algebra.id });
      await completeSession(db, algebra.id, new Date().toISOString());

      expect(await respectsPrereqs(db, calculus.id)).toBe(true);
    });

    it("returns false when a prereq has zero completed sessions", async () => {
      await addDependency(db, { courseId: calculus.id, prereqCourseId: algebra.id });
      // No completed session for algebra

      expect(await respectsPrereqs(db, calculus.id)).toBe(false);
    });

    it("returns false when a prereq has only planned sessions", async () => {
      await addDependency(db, { courseId: calculus.id, prereqCourseId: algebra.id });
      await planSessionToday(db, algebra.id); // planned, not completed

      expect(await respectsPrereqs(db, calculus.id)).toBe(false);
    });

    it("respects multiple prereqs — all must be satisfied", async () => {
      await addDependency(db, { courseId: calculus.id, prereqCourseId: algebra.id });
      await addDependency(db, { courseId: calculus.id, prereqCourseId: mechanics.id });
      await completeSession(db, algebra.id, new Date().toISOString());
      // mechanics has no completed session

      expect(await respectsPrereqs(db, calculus.id)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getColdDomains
  // -----------------------------------------------------------------------
  describe("getColdDomains", () => {
    it("returns domains with no completed sessions at all", async () => {
      const cold = await getColdDomains(db, VID, 7);
      expect(cold.map((d) => d.name).sort()).toEqual(["Math", "Physics"]);
    });

    it("excludes domains with a recent completed session", async () => {
      await completeSession(db, algebra.id, new Date().toISOString());

      const cold = await getColdDomains(db, VID, 7);
      const names = cold.map((d) => d.name);
      expect(names).not.toContain("Math");
      expect(names).toContain("Physics");
    });

    it("uses configured cold days threshold", async () => {
      // Complete a session 3 days ago
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
      await completeSession(db, algebra.id, threeDaysAgo);

      // With threshold 7, Math is NOT cold
      expect((await getColdDomains(db, VID, 7)).map((d) => d.name)).not.toContain("Math");

      // With threshold 1, Math IS cold
      expect((await getColdDomains(db, VID, 1)).map((d) => d.name)).toContain("Math");
    });

    it("reports daysSinceLastSession correctly", async () => {
      const cold = await getColdDomains(db, VID, 7);
      for (const d of cold) {
        expect(d.daysSinceLastSession).toBeGreaterThanOrEqual(7);
      }
    });
  });

  // -----------------------------------------------------------------------
  // getDailyMix
  // -----------------------------------------------------------------------
  describe("getDailyMix", () => {
    it("returns an empty array when there is nothing to recommend", async () => {
      // Complete a recent session for every course (no cold domains)
      const recent = new Date().toISOString();
      await completeSession(db, algebra.id, recent);
      await completeSession(db, calculus.id, recent);
      await completeSession(db, mechanics.id, recent);
      await completeSession(db, thermo.id, recent);

      const mix = await getDailyMix(db, VID);
      expect(mix).toHaveLength(0);
    });

    it("includes courses with planned sessions today as highest priority", async () => {
      await planSessionToday(db, calculus.id);

      const mix = await getDailyMix(db, VID);
      expect(mix.length).toBeGreaterThanOrEqual(1);
      expect(mix[0].courseId).toBe(calculus.id);
      expect(mix[0].reason).toBe("planned");
    });

    it("includes courses with due reviews", async () => {
      await createDueCard(db, mechanics.id);

      const mix = await getDailyMix(db, VID);
      expect(mix.some((m) => m.courseId === mechanics.id && m.reason === "due-review")).toBe(true);
    });

    it("includes cold courses", async () => {
      // Create a completed session outside the cold window
      const longAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      await completeSession(db, algebra.id, longAgo);

      const mix = await getDailyMix(db, VID);
      expect(mix.some((m) => m.courseId === algebra.id && m.reason === "cold")).toBe(true);
    });

    it("deduplicates — keeps the highest priority reason when a course appears in multiple lists", async () => {
      // Calculus: planned session today AND has due cards → should show as 'planned'
      await planSessionToday(db, calculus.id);
      await createDueCard(db, calculus.id);

      const mix = await getDailyMix(db, VID);
      const calculusItems = mix.filter((m) => m.courseId === calculus.id);
      expect(calculusItems).toHaveLength(1);
      expect(calculusItems[0].reason).toBe("planned");
    });

    it("excludes courses with unmet prerequisites", async () => {
      await addDependency(db, { courseId: calculus.id, prereqCourseId: algebra.id });
      await planSessionToday(db, calculus.id);
      // Algebra has no completed sessions

      const mix = await getDailyMix(db, VID);
      expect(mix.some((m) => m.courseId === calculus.id)).toBe(false);
    });

    it("includes courses with satisfied prerequisites", async () => {
      await addDependency(db, { courseId: calculus.id, prereqCourseId: algebra.id });
      await completeSession(db, algebra.id, new Date().toISOString());
      await planSessionToday(db, calculus.id);

      const mix = await getDailyMix(db, VID);
      expect(mix.some((m) => m.courseId === calculus.id)).toBe(true);
    });

    it("interleaves items across domains — no two adjacent from the same domain", async () => {
      // Set up items from both domains
      await planSessionToday(db, calculus.id); // Math
      await planSessionToday(db, mechanics.id); // Physics
      await createDueCard(db, algebra.id); // Math
      await createDueCard(db, thermo.id); // Physics

      const mix = await getDailyMix(db, VID);
      // At this point we have items spanning both domains
      expect(mix.length).toBeGreaterThanOrEqual(2);

      for (let i = 1; i < mix.length; i++) {
        if (mix[i] && mix[i - 1]) {
          expect(mix[i].domainId).not.toBe(mix[i - 1].domainId);
        }
      }
    });

    it("returns at most 5 items", async () => {
      // Create many items
      await planSessionToday(db, algebra.id);
      await planSessionToday(db, calculus.id);
      await planSessionToday(db, mechanics.id);
      await planSessionToday(db, thermo.id);
      // Also create due cards for additional variety
      await createDueCard(db, algebra.id);
      await createDueCard(db, calculus.id);
      await createDueCard(db, mechanics.id);
      await createDueCard(db, thermo.id);

      const mix = await getDailyMix(db, VID);
      expect(mix.length).toBeLessThanOrEqual(5);
    });
  });
});
