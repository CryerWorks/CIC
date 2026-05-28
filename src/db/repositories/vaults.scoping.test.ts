// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain, listDomains } from "./domains";
import { createCourse, listCourses } from "./courses";
import { createMilestone } from "./milestones";
import { getDashboardSummary } from "./dashboard";

/**
 * US1 / SC-001: the active vault is the data boundary across every read surface. Two vaults hold
 * distinct data; each scoped read sees only its own; flipping the vault id restores the other set
 * unchanged (lossless — no read ever mutates). The reactivity that turns this into a live screen
 * refresh is covered at the hook/component level.
 */
async function freshDb() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: "A", path: "/A" });
  await attachVault(db, { id: "B", path: "/B" });
  return db;
}

async function seed(db: NodeSqlExecutor, vaultId: string, domainName: string, courseTitle: string, doneCount: number) {
  const d = await createDomain(db, vaultId, { name: domainName, color: "#8b6cef" });
  const c = await createCourse(db, { title: courseTitle, domainId: d.id });
  for (let i = 0; i < doneCount; i++) {
    await createMilestone(db, { courseId: c.id, capability: `cap ${i}`, orderIndex: i, status: "done" });
  }
}

describe("per-vault isolation across reads (US1 / SC-001)", () => {
  it("each vault's Domains/Courses/Dashboard show only its own data, losslessly", async () => {
    const db = await freshDb();
    await seed(db, "A", "Math", "Real Analysis", 3);
    await seed(db, "B", "Linguistics", "Phonology", 1);

    // Domains
    expect((await listDomains(db, "A")).map((d) => d.name)).toEqual(["Math"]);
    expect((await listDomains(db, "B")).map((d) => d.name)).toEqual(["Linguistics"]);

    // Courses
    expect((await listCourses(db, "A")).map((c) => c.title)).toEqual(["Real Analysis"]);
    expect((await listCourses(db, "B")).map((c) => c.title)).toEqual(["Phonology"]);

    // Dashboard summary
    const a = await getDashboardSummary(db, "A");
    const b = await getDashboardSummary(db, "B");
    expect(a.totals).toEqual({ domains: 1, courses: 1, milestones: 3 });
    expect(b.totals).toEqual({ domains: 1, courses: 1, milestones: 1 });
    expect(a.allocation.map((x) => x.name)).toEqual(["Math"]);
    expect(b.allocation.map((x) => x.name)).toEqual(["Linguistics"]);

    // Flipping the vault id (the "switch back") returns A's data exactly as before — no mutation.
    expect((await listCourses(db, "A")).map((c) => c.title)).toEqual(["Real Analysis"]);
    expect((await getDashboardSummary(db, "A")).totals).toEqual({ domains: 1, courses: 1, milestones: 3 });
  });
});
