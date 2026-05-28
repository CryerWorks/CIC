// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { NodeSqlExecutor } from "../../../db/adapters/node";
import {
  migrate,
  findOrCreateDomainByName,
  createCourse,
  createMilestone,
  getCourse,
  listCourses,
  listDomains,
  listMilestonesByCourse,
} from "../../../db";
import { makeTempVault, type TempVault } from "../../../vault/test-support";
import { materializeCourse } from "./materialize";
import { rescanCourses } from "./rescan";
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

async function freshDb(): Promise<NodeSqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

function writeRaw(vaultPath: string, rel: string, content: string) {
  const abs = join(vaultPath, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function mocFile(id: string, title: string, domain: string, milestoneLines: string[]): string {
  return [
    "---",
    "cic-type: course",
    `cic-id: ${id}`,
    `title: ${title}`,
    `domain: ${domain}`,
    "campaign: null",
    "---",
    "## Capability",
    "<!-- cic:capability -->",
    "Cap.",
    "<!-- /cic:capability -->",
    "",
    "## Milestones",
    "<!-- cic:milestones -->",
    ...milestoneLines,
    "<!-- /cic:milestones -->",
    "",
  ].join("\n");
}

/** Create + materialize a course; returns its id and MOC path. */
async function makeCourse(db: NodeSqlExecutor, vault: { reader: TempVault["reader"]; writer: TempVault["writer"] }, title: string) {
  const domain = await findOrCreateDomainByName(db, "Mathematics");
  const course = await createCourse(db, { title, domainId: domain.id });
  const m1 = await createMilestone(db, { courseId: course.id, capability: "Define a limit", orderIndex: 0 });
  const model: MocModel = {
    id: course.id,
    title,
    domain: "Mathematics",
    campaign: null,
    capability: "Cap.",
    milestones: [{ id: m1.id, capability: "Define a limit", status: "todo" }],
  };
  const res = await materializeCourse({ vault, db }, model);
  return { courseId: course.id, mocPath: res.status === "written" ? res.mocPath : "" };
}

describe("rescanCourses (US3)", () => {
  it("reflects MOC milestone edits back into the app, leaving the file in place (SC-003)", async () => {
    const db = await freshDb();
    const tv = tempVault();
    const vault = { reader: tv.reader, writer: tv.writer };
    const { courseId, mocPath } = await makeCourse(db, vault, "Real Analysis");

    // Hand-add a milestone line inside the managed block (as if edited in Obsidian).
    const abs = join(tv.vaultPath, mocPath);
    writeFileSync(
      abs,
      readFileSync(abs, "utf8").replace(
        "<!-- /cic:milestones -->",
        "- [ ] Prove continuity\n<!-- /cic:milestones -->",
      ),
    );

    const report = await rescanCourses({ vault, db });
    expect(report.updated).toBe(1);
    expect(await tv.reader.exists(mocPath)).toBe(true); // never deleted

    const ms = await listMilestonesByCourse(db, courseId);
    expect(ms.map((m) => m.capability)).toEqual(["Define a limit", "Prove continuity"]);
  });

  it("imports an unknown CIC MOC and auto-creates its Domain (SC-006)", async () => {
    const db = await freshDb();
    const tv = tempVault();
    const id = crypto.randomUUID();
    writeRaw(tv.vaultPath, "Courses/Topology.md", mocFile(id, "Topology", "Geometry", ["- [ ] Define open sets"]));

    const report = await rescanCourses({ vault: { reader: tv.reader, writer: tv.writer }, db });

    expect(report.imported).toBe(1);
    expect((await getCourse(db, id))?.title).toBe("Topology");
    expect((await listDomains(db)).some((d) => d.name === "Geometry")).toBe(true);
  });

  it("ignores Markdown files that are not CIC Course MOCs", async () => {
    const db = await freshDb();
    const tv = tempVault();
    writeRaw(tv.vaultPath, "Notes/Hello.md", "# Hello\n\nJust a note.\n");

    const report = await rescanCourses({ vault: { reader: tv.reader, writer: tv.writer }, db });
    expect(report.results).toHaveLength(0);
    expect(await listCourses(db)).toHaveLength(0);
  });

  it("skips a CIC MOC with a broken body, with a note (FR-019)", async () => {
    const db = await freshDb();
    const tv = tempVault();
    const id = crypto.randomUUID();
    writeRaw(
      tv.vaultPath,
      "Courses/Broken.md",
      [
        "---",
        "cic-type: course",
        `cic-id: ${id}`,
        "title: Broken",
        "domain: Mathematics",
        "campaign: null",
        "---",
        "## Milestones",
        "<!-- cic:milestones -->",
        "- [ ] x",
        "(no close)",
      ].join("\n"),
    );

    const report = await rescanCourses({ vault: { reader: tv.reader, writer: tv.writer }, db });
    const broken = report.results.find((r) => r.path === "Courses/Broken.md");
    expect(broken?.outcome).toBe("skipped");
    expect(broken?.note).toBeTruthy();
    expect(await getCourse(db, id)).toBeNull();
  });

  it("re-matches a moved/renamed MOC by cic-id and updates moc_path (FR-016)", async () => {
    const db = await freshDb();
    const tv = tempVault();
    const vault = { reader: tv.reader, writer: tv.writer };
    const { courseId, mocPath } = await makeCourse(db, vault, "Real Analysis");

    // Simulate a rename in Obsidian: same content, new path, old file gone.
    const content = readFileSync(join(tv.vaultPath, mocPath), "utf8");
    rmSync(join(tv.vaultPath, mocPath));
    writeRaw(tv.vaultPath, "Courses/Renamed.md", content);

    const report = await rescanCourses({ vault, db });
    expect(report.updated).toBe(1);
    expect((await getCourse(db, courseId))?.moc_path).toBe("Courses/Renamed.md");
    expect(await listCourses(db)).toHaveLength(1); // not duplicated
  });

  it("is idempotent — a second rescan changes nothing", async () => {
    const db = await freshDb();
    const tv = tempVault();
    const vault = { reader: tv.reader, writer: tv.writer };
    const { courseId } = await makeCourse(db, vault, "Real Analysis");

    await rescanCourses({ vault, db });
    const after1 = await listCourses(db);
    await rescanCourses({ vault, db });

    expect(await listCourses(db)).toHaveLength(after1.length);
    expect(await listMilestonesByCourse(db, courseId)).toHaveLength(1);
  });
});
