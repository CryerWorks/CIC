// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import { addDependency, removeDependency, getPrereqs, getDependents } from "./courseDependencies";

const VID = "vault-dep";

async function freshDb(): Promise<NodeSqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/vault" });
  return db;
}

describe("courseDependencies repo (F6 / T002)", () => {
  it("addDependency inserts a row and getPrereqs returns it", async () => {
    const db = await freshDb();
    const d = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const algebra = await createCourse(db, { title: "Algebra", domainId: d.id });
    const calculus = await createCourse(db, { title: "Calculus", domainId: d.id });

    await addDependency(db, { courseId: calculus.id, prereqCourseId: algebra.id });

    const prereqs = await getPrereqs(db, calculus.id);
    expect(prereqs).toHaveLength(1);
    expect(prereqs[0].prereq_course_id).toBe(algebra.id);
  });

  it("getDependents returns courses that depend on a given course", async () => {
    const db = await freshDb();
    const d = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const algebra = await createCourse(db, { title: "Algebra", domainId: d.id });
    const calculus = await createCourse(db, { title: "Calculus", domainId: d.id });
    const analysis = await createCourse(db, { title: "Analysis", domainId: d.id });

    await addDependency(db, { courseId: calculus.id, prereqCourseId: algebra.id });
    await addDependency(db, { courseId: analysis.id, prereqCourseId: algebra.id });

    const dependents = await getDependents(db, algebra.id);
    expect(dependents).toHaveLength(2);
    expect(dependents.map((d) => d.course_id)).toContain(calculus.id);
    expect(dependents.map((d) => d.course_id)).toContain(analysis.id);
  });

  it("removeDependency deletes the row", async () => {
    const db = await freshDb();
    const d = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const a = await createCourse(db, { title: "Course A", domainId: d.id });
    const b = await createCourse(db, { title: "Course B", domainId: d.id });

    await addDependency(db, { courseId: b.id, prereqCourseId: a.id });
    expect(await getPrereqs(db, b.id)).toHaveLength(1);

    await removeDependency(db, b.id, a.id);
    expect(await getPrereqs(db, b.id)).toHaveLength(0);
  });

  it("removing a non-existent dependency is a no-op", async () => {
    const db = await freshDb();
    await expect(removeDependency(db, "nonexistent", "also-nonexistent")).resolves.toBeUndefined();
  });

  it("UNIQUE constraint prevents duplicate prereq pairs", async () => {
    const db = await freshDb();
    const d = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const a = await createCourse(db, { title: "Course A", domainId: d.id });
    const b = await createCourse(db, { title: "Course B", domainId: d.id });

    await addDependency(db, { courseId: b.id, prereqCourseId: a.id });
    await expect(addDependency(db, { courseId: b.id, prereqCourseId: a.id })).rejects.toThrow();
  });
});
