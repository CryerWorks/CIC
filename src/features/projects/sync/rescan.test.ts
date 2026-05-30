// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NodeSqlExecutor } from "../../../db/adapters/node";
import {
  migrate,
  attachVault,
  createDomain,
  createCourse,
  createMilestone,
  getProject,
  getProjectMilestoneIds,
} from "../../../db";
import { makeTempVault, type TempVault } from "../../../vault/test-support";
import { rescanProjects } from "./rescan";

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
  const course = await createCourse(db, { title: "Linear Algebra", domainId: domain.id });
  const m1 = await createMilestone(db, { courseId: course.id, capability: "Diagonalize", orderIndex: 0 });
  return { db, course, m1 };
}

function projectFile(front: Record<string, unknown>, body = "## Problem\nx\n"): string {
  const yaml = Object.entries(front)
    .map(([k, v]) => (Array.isArray(v) ? `${k}:\n${v.map((x) => `  - ${x}`).join("\n")}` : `${k}: ${v}`))
    .join("\n");
  return `---\n${yaml}\n---\n\n${body}`;
}

function writeVaultFile(tv: TempVault, relPath: string, content: string): void {
  const abs = join(tv.vaultPath, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

describe("rescanProjects (US3 / FR-014)", () => {
  it("imports a hand-authored Project by course-id, with its milestone link (M2)", async () => {
    const { db, course, m1 } = await setup();
    const tv = tempVault();
    writeVaultFile(tv, 
      "Projects/Hand.md",
      projectFile({
        "cic-type": "project",
        "cic-id": "imported-1",
        "course-id": course.id,
        title: "Hand-authored",
        capability: "Prove it",
        status: "open",
        milestones: [m1.id],
        opened: "2026-05-29",
      }),
    );

    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };
    const report = await rescanProjects(deps, VID);
    expect(report.imported).toBe(1);

    const project = await getProject(db, "imported-1");
    expect(project?.title).toBe("Hand-authored");
    expect(project?.capability).toBe("Prove it");
    expect(await getProjectMilestoneIds(db, "imported-1")).toEqual([m1.id]);
  });

  it("skips a Project whose course-id matches no Course in this vault", async () => {
    const { db } = await setup();
    const tv = tempVault();
    writeVaultFile(tv, 
      "Projects/Orphan.md",
      projectFile({
        "cic-type": "project",
        "cic-id": "orphan-1",
        "course-id": "no-such-course",
        title: "Orphan",
        capability: "x",
        status: "open",
        opened: "2026-05-29",
      }),
    );
    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };
    const report = await rescanProjects(deps, VID);
    expect(report.skipped).toBe(1);
    expect(await getProject(db, "orphan-1")).toBeNull();
  });

  it("imports with an unknown milestone id dropped (M3) and ignores non-Project files", async () => {
    const { db, course } = await setup();
    const tv = tempVault();
    writeVaultFile(tv, 
      "Projects/Drop.md",
      projectFile({
        "cic-type": "project",
        "cic-id": "drop-1",
        "course-id": course.id,
        title: "Drop",
        capability: "x",
        status: "open",
        milestones: ["ghost-milestone"],
        opened: "2026-05-29",
      }),
    );
    writeVaultFile(tv, "Notes/random.md", "---\ntitle: not a project\n---\n\nhi\n");

    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };
    const report = await rescanProjects(deps, VID);
    expect(report.imported).toBe(1); // the non-Project file is silently ignored
    expect(await getProjectMilestoneIds(db, "drop-1")).toEqual([]); // unknown id dropped, Project survives
    expect(await getProject(db, "drop-1")).not.toBeNull();
  });
});
