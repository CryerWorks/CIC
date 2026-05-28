// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { NodeSqlExecutor } from "../../../db/adapters/node";
import { migrate, createDomain, createCourse, createMilestone, listCourses } from "../../../db";
import { makeTempVault, type TempVault } from "../../../vault/test-support";
import { materializeCourse } from "./materialize";
import type { MocModel } from "../moc";

const vaults: TempVault[] = [];
function tempVault(): TempVault {
  const v = makeTempVault();
  vaults.push(v);
  return v;
}
afterEach(() => {
  for (const v of vaults.splice(0)) v.cleanup();
});

async function setup() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  const domain = await createDomain(db, { name: "Mathematics", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Real Analysis", domainId: domain.id });
  const m1 = await createMilestone(db, { courseId: course.id, capability: "Define a limit", orderIndex: 0 });
  const m2 = await createMilestone(db, {
    courseId: course.id,
    capability: "Prove continuity",
    orderIndex: 1,
    status: "done",
  });
  return { db, domain, course, m1, m2 };
}

describe("materializeCourse — new file (US1)", () => {
  it("writes a MOC with capability + milestones and persists moc_path", async () => {
    const { db, course, m1, m2 } = await setup();
    const tv = tempVault();
    const model: MocModel = {
      id: course.id,
      title: "Real Analysis",
      domain: "Mathematics",
      campaign: null,
      capability: "Work rigorously with limits and continuity.",
      milestones: [
        { id: m1.id, capability: "Define a limit", status: "todo" },
        { id: m2.id, capability: "Prove continuity", status: "done" },
      ],
    };

    const result = await materializeCourse({ vault: { reader: tv.reader, writer: tv.writer }, db }, model);

    expect(result.status).toBe("written");
    if (result.status !== "written") return;
    expect(result.mocPath).toBe("Courses/Real Analysis.md");

    const note = await tv.reader.readNote(result.mocPath);
    expect(note.data["cic-type"]).toBe("course");
    expect(note.data["cic-id"]).toBe(course.id);
    expect(note.body).toContain("Work rigorously with limits and continuity.");
    expect(note.body).toContain(`- [ ] Define a limit <!-- cic:m id=${m1.id} status=todo -->`);
    expect(note.body).toContain(`- [x] Prove continuity <!-- cic:m id=${m2.id} status=done -->`);

    const courses = await listCourses(db);
    expect(courses[0].moc_path).toBe("Courses/Real Analysis.md");
  });

  it("avoids filename collisions across distinct courses", async () => {
    const { db, domain, course } = await setup();
    const tv = tempVault();
    const deps = { vault: { reader: tv.reader, writer: tv.writer }, db };
    const other = await createCourse(db, { title: "Real Analysis", domainId: domain.id });

    const empty = (id: string): MocModel => ({
      id,
      title: "Real Analysis",
      domain: "Mathematics",
      campaign: null,
      capability: "",
      milestones: [],
    });

    const first = await materializeCourse(deps, empty(course.id));
    const second = await materializeCourse(deps, empty(other.id));

    expect(first).toEqual({ status: "written", mocPath: "Courses/Real Analysis.md" });
    expect(second).toEqual({ status: "written", mocPath: "Courses/Real Analysis (2).md" });
  });
});
