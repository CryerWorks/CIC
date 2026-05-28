// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { createDomain } from "./domains";
import { createCourse, listCourses, updateCourse } from "./courses";
import { createCampaign, listCampaignsByDomain, getCampaign } from "./campaigns";

async function freshDb(): Promise<NodeSqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

describe("courses repo additions (US1)", () => {
  it("listCourses returns all courses ordered by title", async () => {
    const db = await freshDb();
    const d = await createDomain(db, { name: "Math", color: "#8b6cef" });
    await createCourse(db, { title: "Zeta", domainId: d.id });
    await createCourse(db, { title: "Alpha", domainId: d.id });
    expect((await listCourses(db)).map((c) => c.title)).toEqual(["Alpha", "Zeta"]);
  });

  it("updateCourse patches only the provided fields", async () => {
    const db = await freshDb();
    const d = await createDomain(db, { name: "Math", color: "#8b6cef" });
    const c = await createCourse(db, { title: "RA", domainId: d.id });

    const withPath = await updateCourse(db, c.id, { mocPath: "Courses/RA.md" });
    expect(withPath.moc_path).toBe("Courses/RA.md");
    expect(withPath.title).toBe("RA");

    const renamed = await updateCourse(db, c.id, { title: "Real Analysis" });
    expect(renamed.title).toBe("Real Analysis");
    expect(renamed.moc_path).toBe("Courses/RA.md"); // untouched by the title patch
  });
});

describe("campaigns repo (US1)", () => {
  it("creates, gets, and lists campaigns by domain ordered by title", async () => {
    const db = await freshDb();
    const d = await createDomain(db, { name: "Math", color: "#8b6cef" });
    const c1 = await createCampaign(db, { title: "Track B", domainId: d.id });
    await createCampaign(db, { title: "Track A", domainId: d.id });

    expect((await getCampaign(db, c1.id))?.title).toBe("Track B");
    expect((await listCampaignsByDomain(db, d.id)).map((c) => c.title)).toEqual(["Track A", "Track B"]);
  });
});
