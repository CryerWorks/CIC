// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
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
import type { ProjectDocModel } from "../doc";
import { materializeNewProject, updateProjectFrontmatter, closeProjectFile } from "./materialize";

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
  const m1 = await createMilestone(db, { courseId: course.id, capability: "Diagonalize a matrix", orderIndex: 0 });
  const project = await createProject(db, {
    courseId: course.id,
    title: "Diagonalize a 3×3",
    capability: "I can diagonalize a real symmetric matrix unaided.",
    milestoneIds: [m1.id],
    template: "math/proof",
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
    template: "math/proof",
  };
  return { db, course, m1, project, model };
}

describe("materializeNewProject (US1)", () => {
  it("writes a file with cic-type/course-id frontmatter + the template body, and persists project_path", async () => {
    const { db, course, project, model } = await setup();
    const tv = tempVault();
    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };

    const result = await materializeNewProject(deps, model);
    expect(result.status).toBe("written");
    if (result.status !== "written") return;
    expect(result.projectPath).toBe("Projects/Diagonalize a 3×3.md");

    const note = await tv.reader.readNote(result.projectPath);
    expect(note.data["cic-type"]).toBe("project");
    expect(note.data["cic-id"]).toBe(project.id);
    expect(note.data["course-id"]).toBe(course.id);
    expect(note.body).toContain("## Problem");
    expect(note.body).toContain("## Reflection");

    expect((await getProject(db, project.id))?.project_path).toBe(result.projectPath);
  });

  it("weaves the opening framing into the Problem section (M1)", async () => {
    const { db, model } = await setup();
    const tv = tempVault();
    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };

    const result = await materializeNewProject(deps, model, "Solve problems 1–10 from Strang Ch.6.");
    if (result.status !== "written") throw new Error("expected written");
    const note = await tv.reader.readNote(result.projectPath);
    expect(note.body).toContain("Solve problems 1–10 from Strang Ch.6.");
  });
});

describe("updateProjectFrontmatter / closeProjectFile (US1/US2)", () => {
  it("rewrites frontmatter while preserving the learner's body verbatim", async () => {
    const { db, model } = await setup();
    const tv = tempVault();
    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };

    await materializeNewProject(deps, model);
    const path = "Projects/Diagonalize a 3×3.md";

    // The learner adds their own work to the body (through the writer, so it's a managed write — no
    // drift). A subsequent frontmatter-only update must keep that body verbatim.
    const current = await tv.reader.readNote(path);
    await tv.writer.writeNote(
      path,
      { frontmatter: current.data, body: `${current.body}\nMy own proof work here.\n` },
      { overwrite: true },
    );

    const res = await updateProjectFrontmatter(deps, { ...model, status: "in-progress" });
    expect(res.status).toBe("written");
    const note = await tv.reader.readNote(path);
    expect(note.data.status).toBe("in-progress");
    expect(note.body).toContain("My own proof work here."); // body preserved
  });

  it("appends the reflection on close without clobbering the body (R3)", async () => {
    const { db, model } = await setup();
    const tv = tempVault();
    const deps = { vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity }, db };

    await materializeNewProject(deps, model);
    const closed = { ...model, status: "complete" as const, closedDate: "2026-06-02" };
    const res = await closeProjectFile(deps, closed, "kept dropping the sign on the eigenvector");
    expect(res.status).toBe("written");
    const note = await tv.reader.readNote("Projects/Diagonalize a 3×3.md");
    expect(note.data.status).toBe("complete");
    expect(note.body).toContain("## Reflection (closed 2026-06-02)");
    expect(note.body).toContain("kept dropping the sign on the eigenvector");
    expect(note.body).toContain("## Problem"); // original template body still present
  });
});
