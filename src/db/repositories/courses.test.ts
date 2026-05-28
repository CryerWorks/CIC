// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse, listCourses, updateCourse, getCourse, deleteCourse } from "./courses";
import { createMilestone, listMilestonesByCourse } from "./milestones";
import { createCampaign, listCampaignsByDomain, getCampaign } from "./campaigns";

const VID = "vault-1";

async function freshDb(): Promise<NodeSqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/vault" }); // domains.vault_id FK needs a vaults row
  return db;
}

describe("courses repo additions (US1)", () => {
  it("listCourses returns the active vault's courses ordered by title", async () => {
    const db = await freshDb();
    const d = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    await createCourse(db, { title: "Zeta", domainId: d.id });
    await createCourse(db, { title: "Alpha", domainId: d.id });
    expect((await listCourses(db, VID)).map((c) => c.title)).toEqual(["Alpha", "Zeta"]);
  });

  it("updateCourse patches only the provided fields", async () => {
    const db = await freshDb();
    const d = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const c = await createCourse(db, { title: "RA", domainId: d.id });

    const withPath = await updateCourse(db, c.id, { mocPath: "Courses/RA.md" });
    expect(withPath.moc_path).toBe("Courses/RA.md");
    expect(withPath.title).toBe("RA");

    const renamed = await updateCourse(db, c.id, { title: "Real Analysis" });
    expect(renamed.title).toBe("Real Analysis");
    expect(renamed.moc_path).toBe("Courses/RA.md"); // untouched by the title patch
  });

  it("deleteCourse removes the course and cascades its milestones", async () => {
    const db = await freshDb();
    const d = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const c = await createCourse(db, { title: "RA", domainId: d.id });
    await createMilestone(db, { courseId: c.id, capability: "Define a limit", orderIndex: 0 });

    await deleteCourse(db, c.id);

    expect(await getCourse(db, c.id)).toBeNull();
    expect(await listMilestonesByCourse(db, c.id)).toHaveLength(0);
  });
});

describe("campaigns repo (US1)", () => {
  it("creates, gets, and lists campaigns by domain ordered by title", async () => {
    const db = await freshDb();
    const d = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
    const c1 = await createCampaign(db, { title: "Track B", domainId: d.id });
    await createCampaign(db, { title: "Track A", domainId: d.id });

    expect((await getCampaign(db, c1.id))?.title).toBe("Track B");
    expect((await listCampaignsByDomain(db, d.id)).map((c) => c.title)).toEqual(["Track A", "Track B"]);
  });
});
