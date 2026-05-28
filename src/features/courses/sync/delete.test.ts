// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeSqlExecutor } from "../../../db/adapters/node";
import {
  migrate,
  createDomain,
  createCourse,
  createMilestone,
  getCourse,
  listMilestonesByCourse,
} from "../../../db";
import { makeTempVault, type TempVault } from "../../../vault/test-support";
import { MocCourseFrontmatterSchema } from "../moc";
import { materializeCourse } from "./materialize";
import { removeCourse } from "./delete";
import type { MocModel } from "../moc";
import type { CourseSyncDeps } from "./materialize";

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
  const tv = tempVault();
  const deps: CourseSyncDeps = { vault: { reader: tv.reader, writer: tv.writer }, db };
  return { db, domain, course, m1, tv, deps };
}

function model(courseId: string, milestoneId: string): MocModel {
  return {
    id: courseId,
    title: "Real Analysis",
    domain: "Mathematics",
    campaign: null,
    capability: "Work rigorously with limits.",
    milestones: [{ id: milestoneId, capability: "Define a limit", status: "todo" }],
  };
}

describe("removeCourse — detach (keep the note)", () => {
  it("drops the DB rows, keeps the file, and strips the CIC discriminator so it won't re-import", async () => {
    const { db, course, m1, tv, deps } = await setup();
    await materializeCourse(deps, model(course.id, m1.id));
    const abs = join(tv.vaultPath, "Courses", "Real Analysis.md");
    writeFileSync(abs, `${readFileSync(abs, "utf8")}\n## Reflections\nMy private note.\n`);

    const res = await removeCourse(deps, course.id, "detach");

    expect(res.status).toBe("removed");
    expect(await getCourse(db, course.id)).toBeNull();
    expect(await listMilestonesByCourse(db, course.id)).toHaveLength(0); // cascade
    expect(existsSync(abs)).toBe(true); // note preserved

    const text = readFileSync(abs, "utf8");
    expect(text).toContain("My private note."); // user content untouched
    expect(text).not.toContain("cic-type"); // no longer a CIC MOC

    const outcome = await tv.reader.readNoteAs("Courses/Real Analysis.md", MocCourseFrontmatterSchema);
    expect(outcome.ok).toBe(false); // a rescan would no longer recognize it as a Course
  });
});

describe("removeCourse — deleteFile (hard delete)", () => {
  it("removes both the DB rows and the MOC file", async () => {
    const { db, course, m1, tv, deps } = await setup();
    await materializeCourse(deps, model(course.id, m1.id));
    const abs = join(tv.vaultPath, "Courses", "Real Analysis.md");

    const res = await removeCourse(deps, course.id, "deleteFile");

    expect(res.status).toBe("removed");
    expect(await getCourse(db, course.id)).toBeNull();
    expect(existsSync(abs)).toBe(false);
  });

  it("surfaces a conflict on external drift and leaves BOTH the file and the rows intact", async () => {
    const { db, course, m1, tv, deps } = await setup();
    await materializeCourse(deps, model(course.id, m1.id));
    const abs = join(tv.vaultPath, "Courses", "Real Analysis.md");
    writeFileSync(abs, `${readFileSync(abs, "utf8")}\nEdited in Obsidian.\n`);

    const res = await removeCourse(deps, course.id, "deleteFile");

    expect(res).toEqual({ status: "conflict", reason: "drifted", mocPath: "Courses/Real Analysis.md" });
    expect(existsSync(abs)).toBe(true);
    expect(await getCourse(db, course.id)).not.toBeNull(); // rows kept so the user can retry/cancel
  });

  it("overwrite forces the delete past a drift conflict", async () => {
    const { db, course, m1, tv, deps } = await setup();
    await materializeCourse(deps, model(course.id, m1.id));
    const abs = join(tv.vaultPath, "Courses", "Real Analysis.md");
    writeFileSync(abs, `${readFileSync(abs, "utf8")}\nEdited in Obsidian.\n`);

    const res = await removeCourse(deps, course.id, "deleteFile", { overwrite: true });

    expect(res.status).toBe("removed");
    expect(existsSync(abs)).toBe(false);
    expect(await getCourse(db, course.id)).toBeNull();
  });
});

describe("removeCourse — no MOC (a row from a failed save)", () => {
  it("just drops the DB rows when the course never materialized a MOC", async () => {
    const { db, course, deps } = await setup();
    expect((await getCourse(db, course.id))?.moc_path).toBeNull();

    const res = await removeCourse(deps, course.id, "detach");

    expect(res.status).toBe("removed");
    expect(await getCourse(db, course.id)).toBeNull();
  });
});
