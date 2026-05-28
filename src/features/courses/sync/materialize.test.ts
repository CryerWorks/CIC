// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeSqlExecutor } from "../../../db/adapters/node";
import { migrate, attachVault, createDomain, createCourse, createMilestone, listCourses } from "../../../db";
import { makeTempVault, type TempVault } from "../../../vault/test-support";
import { materializeCourse, reapplyCourse } from "./materialize";
import type { MocModel } from "../moc";

const VID = "vault-1";

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
  await attachVault(db, { id: VID, path: "/vault" });
  const domain = await createDomain(db, VID, { name: "Mathematics", color: "#8b6cef" });
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

    const result = await materializeCourse({ vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db }, model);

    expect(result.status).toBe("written");
    if (result.status !== "written") return;
    expect(result.mocPath).toBe("Courses/Real Analysis.md");

    const note = await tv.reader.readNote(result.mocPath);
    expect(note.data["cic-type"]).toBe("course");
    expect(note.data["cic-id"]).toBe(course.id);
    expect(note.body).toContain("Work rigorously with limits and continuity.");
    expect(note.body).toContain(`- [ ] Define a limit <!-- cic:m id=${m1.id} status=todo -->`);
    expect(note.body).toContain(`- [x] Prove continuity <!-- cic:m id=${m2.id} status=done -->`);

    const courses = await listCourses(db, VID);
    expect(courses[0].moc_path).toBe("Courses/Real Analysis.md");
  });

  it("avoids filename collisions across distinct courses", async () => {
    const { db, domain, course } = await setup();
    const tv = tempVault();
    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };
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

describe("materializeCourse — update & drift (US2)", () => {
  function modelV1(courseId: string, milestoneId: string): MocModel {
    return {
      id: courseId,
      title: "Real Analysis",
      domain: "Mathematics",
      campaign: null,
      capability: "v1 capability.",
      milestones: [{ id: milestoneId, capability: "Define a limit", status: "todo" }],
    };
  }

  it("updates an existing MOC in place when there is no external drift", async () => {
    const { db, course, m1 } = await setup();
    const tv = tempVault();
    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };

    await materializeCourse(deps, modelV1(course.id, m1.id));
    const res = await materializeCourse(deps, { ...modelV1(course.id, m1.id), capability: "v2 capability." });

    expect(res.status).toBe("written");
    const note = await tv.reader.readNote("Courses/Real Analysis.md");
    expect(note.body).toContain("v2 capability.");
    expect(note.body).not.toContain("v1 capability.");
  });

  it("preserves user content; external drift → conflict → reapply rewrites without loss", async () => {
    const { db, course, m1 } = await setup();
    const tv = tempVault();
    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };

    await materializeCourse(deps, modelV1(course.id, m1.id));

    // Simulate the user editing the MOC in Obsidian (append a Reflections note).
    const abs = join(tv.vaultPath, "Courses", "Real Analysis.md");
    writeFileSync(abs, `${readFileSync(abs, "utf8")}\nMy private reflection.\n`);

    const v2: MocModel = {
      ...modelV1(course.id, m1.id),
      milestones: [{ id: m1.id, capability: "Define a limit precisely", status: "in-progress" }],
    };

    const conflict = await materializeCourse(deps, v2);
    expect(conflict).toEqual({ status: "conflict", mocPath: "Courses/Real Analysis.md", reason: "drifted" });

    const resolved = await reapplyCourse(deps, v2);
    expect(resolved.status).toBe("written");

    const note = await tv.reader.readNote("Courses/Real Analysis.md");
    expect(note.body).toContain("My private reflection.");
    expect(note.body).toContain(`- [/] Define a limit precisely <!-- cic:m id=${m1.id} status=in-progress -->`);
  });
});
