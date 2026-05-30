// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeSqlExecutor } from "../../../db/adapters/node";
import {
  migrate,
  attachVault,
  createDomain,
  createCourse,
  createMilestone,
  createProject,
  getProject,
} from "../../../db";
import { makeTempVault, type TempVault } from "../../../vault/test-support";
import { materializeNewProject } from "./materialize";
import { rescanProjects } from "./rescan";
import { removeProject } from "./delete";
import type { ProjectDocModel } from "../doc";

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

async function setupWithFile(tv: TempVault) {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/vault" });
  const domain = await createDomain(db, VID, { name: "Mathematics", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Linear Algebra", domainId: domain.id });
  const m1 = await createMilestone(db, { courseId: course.id, capability: "Diagonalize", orderIndex: 0 });
  const project = await createProject(db, {
    courseId: course.id,
    title: "Diagonalize a 3×3",
    capability: "I can diagonalize unaided.",
    milestoneIds: [m1.id],
  });
  const model: ProjectDocModel = {
    id: project.id,
    courseId: course.id,
    title: project.title,
    courseTitle: "Linear Algebra",
    capability: project.capability,
    status: "open",
    milestoneIds: [m1.id],
    openedDate: project.opened_at.slice(0, 10),
    closedDate: null,
    template: null,
  };
  const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };
  await materializeNewProject(deps, model);
  return { db, deps, project };
}

describe("removeProject (US3 / FR-016/FR-018)", () => {
  it("detach: keeps the file, strips CIC tags, drops the rows, and won't re-import", async () => {
    const tv = tempVault();
    const { db, deps, project } = await setupWithFile(tv);

    const res = await removeProject(deps, project.id, "detach");
    expect(res.status).toBe("removed");
    expect(await getProject(db, project.id)).toBeNull();

    // File remains but is no longer a CIC Project → a rescan does not re-import it.
    expect(await tv.reader.exists("Projects/Diagonalize a 3×3.md")).toBe(true);
    const report = await rescanProjects(deps, VID);
    expect(report.imported).toBe(0);
    expect(await getProject(db, project.id)).toBeNull();
  });

  it("deleteFile: removes the file and the rows", async () => {
    const tv = tempVault();
    const { db, deps, project } = await setupWithFile(tv);

    const res = await removeProject(deps, project.id, "deleteFile");
    expect(res.status).toBe("removed");
    expect(await tv.reader.exists("Projects/Diagonalize a 3×3.md")).toBe(false);
    expect(await getProject(db, project.id)).toBeNull();
  });

  it("deleteFile on a drifted file → conflict; file + rows left intact until 'delete anyway'", async () => {
    const tv = tempVault();
    const { db, deps, project } = await setupWithFile(tv);

    // Simulate an external edit in Obsidian (drift vs the recorded fingerprint).
    const abs = join(tv.vaultPath, "Projects", "Diagonalize a 3×3.md");
    writeFileSync(abs, `${readFileSync(abs, "utf8")}\nedited outside CIC\n`);

    const conflict = await removeProject(deps, project.id, "deleteFile");
    expect(conflict.status).toBe("conflict");
    expect(await tv.reader.exists("Projects/Diagonalize a 3×3.md")).toBe(true);
    expect(await getProject(db, project.id)).not.toBeNull(); // rows intact on conflict

    const forced = await removeProject(deps, project.id, "deleteFile", { overwrite: true });
    expect(forced.status).toBe("removed");
    expect(await tv.reader.exists("Projects/Diagonalize a 3×3.md")).toBe(false);
    expect(await getProject(db, project.id)).toBeNull();
  });
});
