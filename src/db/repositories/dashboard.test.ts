// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import { createMilestone } from "./milestones";
import { createProject, markProjectInProgress, closeProject } from "./projects";
import { getDashboardSummary } from "./dashboard";
import type { MilestoneStatus } from "../models/enums";

const VID = "vault-1";

async function freshDb(): Promise<NodeSqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/vault" });
  return db;
}

/** Seed `statuses.length` milestones under a fresh course in `domainId`. */
async function seedCourse(db: NodeSqlExecutor, domainId: string, title: string, statuses: MilestoneStatus[]) {
  const course = await createCourse(db, { title, domainId });
  let order = 0;
  for (const status of statuses) {
    await createMilestone(db, { courseId: course.id, capability: `cap ${order}`, orderIndex: order, status });
    order += 1;
  }
  return course;
}

describe("getDashboardSummary — totals & progress (US1)", () => {
  it("counts domains/courses/milestones and the status breakdown with percentDone", async () => {
    const db = await freshDb();
    const math = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const cs = await createDomain(db, VID, { name: "CS", color: "#00bfbc" });
    // 30 milestones total, 12 done → 40%.
    await seedCourse(db, math.id, "Real Analysis", [
      ...Array<MilestoneStatus>(8).fill("done"),
      ...Array<MilestoneStatus>(6).fill("in-progress"),
      ...Array<MilestoneStatus>(6).fill("todo"),
    ]);
    await seedCourse(db, cs.id, "Algorithms", [
      ...Array<MilestoneStatus>(4).fill("done"),
      ...Array<MilestoneStatus>(6).fill("todo"),
    ]);

    const s = await getDashboardSummary(db, VID);

    expect(s.totals).toEqual({ domains: 2, courses: 2, milestones: 30 });
    expect(s.milestoneProgress).toEqual({ todo: 12, inProgress: 6, done: 12, total: 30, percentDone: 40 });
  });
});

describe("getDashboardSummary — edge data (US1 · FR-010)", () => {
  it("empty database → all zeros, percentDone 0 (no NaN), empty allocation", async () => {
    const db = await freshDb();
    const s = await getDashboardSummary(db, VID);
    expect(s.totals).toEqual({ domains: 0, courses: 0, milestones: 0 });
    expect(s.milestoneProgress).toEqual({ todo: 0, inProgress: 0, done: 0, total: 0, percentDone: 0 });
    expect(Number.isNaN(s.milestoneProgress.percentDone)).toBe(false);
    expect(s.allocation).toEqual([]);
  });

  it("a Course with no Milestones counts as a Course but contributes no milestones", async () => {
    const db = await freshDb();
    const d = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    await createCourse(db, { title: "Empty Course", domainId: d.id });
    const s = await getDashboardSummary(db, VID);
    expect(s.totals).toEqual({ domains: 1, courses: 1, milestones: 0 });
    expect(s.milestoneProgress.percentDone).toBe(0);
    expect(s.allocation[0]).toMatchObject({ courseCount: 1, milestoneCount: 0 });
  });
});

describe("getDashboardSummary — allocation (US2 · FR-003)", () => {
  it("includes Domains with zero Courses, carries colors, and sums back to totals; ordered by name", async () => {
    const db = await freshDb();
    const math = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const cs = await createDomain(db, VID, { name: "CS", color: "#00bfbc" });
    await createDomain(db, VID, { name: "Zoology", color: "#ffaa00" }); // no courses
    await seedCourse(db, math.id, "Real Analysis", ["done", "todo"]);
    await seedCourse(db, math.id, "Topology", ["in-progress"]);
    await seedCourse(db, cs.id, "Algorithms", ["todo", "todo", "done"]);

    const s = await getDashboardSummary(db, VID);

    // Ordered by name: CS, Math, Zoology.
    expect(s.allocation.map((a) => a.name)).toEqual(["CS", "Math", "Zoology"]);
    const byName = Object.fromEntries(s.allocation.map((a) => [a.name, a]));
    expect(byName.Math).toMatchObject({ color: "#8b6cef", courseCount: 2, milestoneCount: 3 });
    expect(byName.CS).toMatchObject({ color: "#00bfbc", courseCount: 1, milestoneCount: 3 });
    expect(byName.Zoology).toMatchObject({ courseCount: 0, milestoneCount: 0 }); // still present

    expect(s.allocation.reduce((n, a) => n + a.courseCount, 0)).toBe(s.totals.courses);
    expect(s.allocation.reduce((n, a) => n + a.milestoneCount, 0)).toBe(s.totals.milestones);
  });
});

describe("getDashboardSummary — active projects (Feature 015)", () => {
  it("surfaces only open/in-progress Projects with their Domain, and nothing when none", async () => {
    const db = await freshDb();
    const math = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const course = await seedCourse(db, math.id, "Linear Algebra", ["todo"]);
    const m = await createMilestone(db, { courseId: course.id, capability: "x", orderIndex: 9 });

    expect((await getDashboardSummary(db, VID)).activeProjects).toEqual([]);

    const open = await createProject(db, { courseId: course.id, title: "Open one", capability: "c", milestoneIds: [m.id] });
    const prog = await createProject(db, { courseId: course.id, title: "In progress", capability: "c", milestoneIds: [m.id] });
    await markProjectInProgress(db, prog.id);
    const done = await createProject(db, { courseId: course.id, title: "Done", capability: "c", milestoneIds: [m.id] });
    await closeProject(db, { projectId: done.id, outcome: "complete" });

    const s = await getDashboardSummary(db, VID);
    expect(s.activeProjects.map((p) => p.id).sort()).toEqual([open.id, prog.id].sort());
    expect(s.activeProjects.every((p) => p.domainId === math.id)).toBe(true);
    expect(s.activeProjects.find((p) => p.id === open.id)?.courseId).toBe(course.id);

    expect(await getDashboardSummary(db, "other-vault").then((x) => x.activeProjects)).toEqual([]);
  });
});
