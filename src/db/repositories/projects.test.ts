// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import {
  migrate,
  attachVault,
  createDomain,
  createCourse,
  createMilestone,
  deleteMilestone,
  registerResource,
  deleteResource,
  createProject,
  getProject,
  listCourseProjects,
  listActiveProjects,
  getProjectMilestoneIds,
  listProjectResources,
  setProjectMilestones,
  setProjectResources,
  markProjectInProgress,
  closeProject,
  getCard,
  listCardsByCourse,
} from "../index";

const VID = "vault-proj";

async function setup() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/vault" });
  const domain = await createDomain(db, VID, { name: "Mathematics", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Linear Algebra", domainId: domain.id });
  const m1 = await createMilestone(db, { courseId: course.id, capability: "Diagonalize a matrix", orderIndex: 0 });
  const m2 = await createMilestone(db, { courseId: course.id, capability: "Prove the spectral theorem", orderIndex: 1 });
  const res = await registerResource(db, VID, { title: "Strang", kind: "book" });
  return { db, domain, course, m1, m2, res };
}

describe("projects repository (Feature 015)", () => {
  it("creates a Project with milestone + resource links round-tripping", async () => {
    const { db, course, m1, m2, res } = await setup();
    const project = await createProject(db, {
      courseId: course.id,
      title: "Diagonalize a 3×3 by hand",
      capability: "I can diagonalize a real symmetric matrix unaided.",
      milestoneIds: [m1.id, m2.id],
      template: "math/proof",
      resources: [{ resource_id: res.id, locator: "Ch. 6" }],
    });
    expect(project.status).toBe("open");
    expect(project.title).toBe("Diagonalize a 3×3 by hand");

    expect((await getProjectMilestoneIds(db, project.id)).sort()).toEqual([m1.id, m2.id].sort());
    expect(await listProjectResources(db, project.id)).toEqual([{ resource_id: res.id, locator: "Ch. 6" }]);
  });

  it("rejects creation without a title, capability, or any milestone", async () => {
    const { db, course, m1 } = await setup();
    const base = { courseId: course.id, title: "T", capability: "C", milestoneIds: [m1.id] };
    await expect(createProject(db, { ...base, title: "  " })).rejects.toThrow(/title/i);
    await expect(createProject(db, { ...base, capability: "  " })).rejects.toThrow(/capability/i);
    await expect(createProject(db, { ...base, milestoneIds: [] })).rejects.toThrow(/Milestone/i);
  });

  it("lists a Course's Projects active-first and scopes active Projects to the vault", async () => {
    const { db, course, m1 } = await setup();
    const a = await createProject(db, { courseId: course.id, title: "A", capability: "ca", milestoneIds: [m1.id] });
    const b = await createProject(db, { courseId: course.id, title: "B", capability: "cb", milestoneIds: [m1.id] });
    await markProjectInProgress(db, b.id);

    const listed = await listCourseProjects(db, course.id);
    expect(listed.map((p) => p.id)).toContain(a.id);
    expect(listed.map((p) => p.id)).toContain(b.id);

    const active = await listActiveProjects(db, VID);
    expect(active.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());

    const otherVault = await listActiveProjects(db, "some-other-vault");
    expect(otherVault).toEqual([]);
  });

  it("replaces milestone and resource sets", async () => {
    const { db, course, m1, m2, res } = await setup();
    const p = await createProject(db, { courseId: course.id, title: "P", capability: "c", milestoneIds: [m1.id] });
    await setProjectMilestones(db, p.id, [m2.id]);
    expect(await getProjectMilestoneIds(db, p.id)).toEqual([m2.id]);
    await setProjectResources(db, p.id, [{ resource_id: res.id, locator: null }]);
    expect(await listProjectResources(db, p.id)).toEqual([{ resource_id: res.id, locator: null }]);
    await expect(setProjectMilestones(db, p.id, [])).rejects.toThrow(/at least one/i);
  });

  it("survives deletion of a referenced Milestone or Resource (M3/FR-020)", async () => {
    const { db, course, m1, m2, res } = await setup();
    const p = await createProject(db, {
      courseId: course.id,
      title: "P",
      capability: "c",
      milestoneIds: [m1.id, m2.id],
      resources: [{ resource_id: res.id, locator: "Ch.1" }],
    });

    // Deleting one Milestone drops only that join; the Project survives with its remaining link.
    await deleteMilestone(db, m1.id);
    expect(await getProject(db, p.id)).not.toBeNull();
    expect(await getProjectMilestoneIds(db, p.id)).toEqual([m2.id]);

    // Deleting the last Milestone leaves the Project with ZERO links — tolerated post-deletion.
    await deleteMilestone(db, m2.id);
    expect(await getProject(db, p.id)).not.toBeNull();
    expect(await getProjectMilestoneIds(db, p.id)).toEqual([]);

    // Deleting the Resource drops only the project_resources join; the Project survives.
    await deleteResource(db, res.id);
    expect(await getProject(db, p.id)).not.toBeNull();
    expect(await listProjectResources(db, p.id)).toEqual([]);
  });
});

describe("closeProject (US2 / Constitution III)", () => {
  it("completes a Project and spawns ONLY the confirmed cards, each linked to the Project", async () => {
    const { db, course, m1 } = await setup();
    const p = await createProject(db, { courseId: course.id, title: "P", capability: "c", milestoneIds: [m1.id] });

    const { project, spawnedCardIds } = await closeProject(db, {
      projectId: p.id,
      outcome: "complete",
      cards: [{ front: "Q", back: "A" }],
    });

    expect(project.status).toBe("complete");
    expect(project.closed_at).not.toBeNull();
    expect(spawnedCardIds).toHaveLength(1);
    const card = await getCard(db, spawnedCardIds[0]);
    expect(card?.project_id).toBe(p.id);
    expect(card?.front).toBe("Q");
  });

  it("spawns no cards when none are provided, and abandoning is a neutral close", async () => {
    const { db, course, m1 } = await setup();
    const p = await createProject(db, { courseId: course.id, title: "P", capability: "c", milestoneIds: [m1.id] });

    const { project, spawnedCardIds } = await closeProject(db, { projectId: p.id, outcome: "abandoned" });
    expect(project.status).toBe("abandoned");
    expect(spawnedCardIds).toEqual([]);
    expect(await listCardsByCourse(db, course.id)).toHaveLength(0);
  });

  it("never sets complete without an explicit close (markInProgress doesn't)", async () => {
    const { db, course, m1 } = await setup();
    const p = await createProject(db, { courseId: course.id, title: "P", capability: "c", milestoneIds: [m1.id] });
    await markProjectInProgress(db, p.id);
    expect((await getProject(db, p.id))?.status).toBe("in-progress");
  });
});
