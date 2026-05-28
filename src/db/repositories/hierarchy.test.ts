// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain, getDomain } from "./domains";
import { createCourse, listCoursesByDomain } from "./courses";
import { createMilestone, listMilestonesByCourse } from "./milestones";
import { insert } from "./query";

const VID = "vault-1";

const tempFiles: string[] = [];
function tempDbPath(): string {
  const path = join(tmpdir(), `cic-test-${crypto.randomUUID()}.db`);
  tempFiles.push(path);
  return path;
}

afterEach(() => {
  for (const f of tempFiles.splice(0)) {
    rmSync(f, { force: true });
  }
});

describe("core hierarchy — round-trip, restart, integrity (US1)", () => {
  it("persists Domain → Course → Milestones and reads them back across a reopen (AS-1, SC-002)", async () => {
    const path = tempDbPath();

    // Session 1: create the hierarchy, then close the handle (simulating app shutdown).
    const db1 = NodeSqlExecutor.open(path);
    await migrate(db1);
    await attachVault(db1, { id: VID, path: "/vault" });
    const domain = await createDomain(db1, VID, { name: "Mathematics", color: "#8b6cef" });
    const course = await createCourse(db1, {
      title: "Real Analysis",
      domainId: domain.id,
      mocPath: "Math/Real Analysis.md",
    });
    await createMilestone(db1, { courseId: course.id, capability: "Define a limit", orderIndex: 0 });
    await createMilestone(db1, { courseId: course.id, capability: "Prove continuity", orderIndex: 1 });
    db1.close();

    // Session 2: reopen the same file — data must still be there and linked.
    const db2 = NodeSqlExecutor.open(path);
    const reloaded = await getDomain(db2, domain.id);
    expect(reloaded).toEqual(domain);

    const courses = await listCoursesByDomain(db2, domain.id);
    expect(courses).toHaveLength(1);
    expect(courses[0]).toEqual(course);
    expect(courses[0].moc_path).toBe("Math/Real Analysis.md");

    const milestones = await listMilestonesByCourse(db2, course.id);
    expect(milestones).toHaveLength(2);
    expect(milestones.map((m) => m.capability)).toEqual(["Define a limit", "Prove continuity"]);
    expect(milestones[0].status).toBe("todo"); // default applied
    db2.close();
  });

  it("rejects a Course referencing a missing Domain (FR-003, AS-3)", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await expect(
      createCourse(db, { title: "Orphan", domainId: "does-not-exist" }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate Domain name (UNIQUE constraint)", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    await createDomain(db, VID, { name: "Physics", color: "#00bfbc" });
    await expect(
      insert(db, "domains", { id: crypto.randomUUID(), name: "Physics", color: "#fff" }),
    ).rejects.toThrow();
  });
});
