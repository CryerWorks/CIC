// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import {
  registerResource,
  getResource,
  listResources,
  updateResource,
  deleteResource,
  linkResourceToCourse,
  unlinkResourceFromCourse,
  listCourseResources,
} from "./resources";

const VID = "vault-1";

async function setup() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/v1" });
  const domain = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Real Analysis", domainId: domain.id });
  return { db, course };
}

describe("resources repo", () => {
  it("registers a Resource with vault scope + validated per-kind metadata", async () => {
    const { db } = await setup();
    const r = await registerResource(db, VID, {
      title: "Baby Rudin",
      kind: "book",
      metadata: { author: "Walter Rudin", isbn: "9780070542358" },
    });
    expect(r.vault_id).toBe(VID);
    expect(r.kind).toBe("book");
    expect(r.metadata).toEqual({ author: "Walter Rudin", isbn: "9780070542358" });
    expect((await getResource(db, r.id))?.title).toBe("Baby Rudin");
  });

  it("rejects metadata keys that don't belong to the kind", async () => {
    const { db } = await setup();
    await expect(
      registerResource(db, VID, { title: "x", kind: "book", metadata: { durationSec: 10 } as never }),
    ).rejects.toThrow();
  });

  it("lists Resources scoped to the active vault (two-vault isolation)", async () => {
    const { db } = await setup();
    const VID2 = "vault-2";
    await attachVault(db, { id: VID2, path: "/v2" });
    await registerResource(db, VID, { title: "In V1", kind: "pdf" });
    await registerResource(db, VID2, { title: "In V2", kind: "pdf" });

    expect((await listResources(db, VID)).map((r) => r.title)).toEqual(["In V1"]);
    expect((await listResources(db, VID2)).map((r) => r.title)).toEqual(["In V2"]);
  });

  it("updates a Resource's fields + metadata", async () => {
    const { db } = await setup();
    const r = await registerResource(db, VID, { title: "Lecture", kind: "video_url", url: "https://x" });
    const updated = await updateResource(db, r.id, { title: "Lecture 1", metadata: { channel: "MIT OCW" } });
    expect(updated.title).toBe("Lecture 1");
    expect(updated.metadata).toEqual({ channel: "MIT OCW" });
  });

  it("links/unlinks a Resource to a Course and lists course resources", async () => {
    const { db, course } = await setup();
    const r = await registerResource(db, VID, { title: "Notes", kind: "markdown" });
    await linkResourceToCourse(db, { courseId: course.id, resourceId: r.id, role: "primary" });
    expect((await listCourseResources(db, course.id)).map((x) => x.title)).toEqual(["Notes"]);

    await unlinkResourceFromCourse(db, course.id, r.id);
    expect(await listCourseResources(db, course.id)).toHaveLength(0);
  });

  it("deleting a Resource removes its course links but not the Course", async () => {
    const { db, course } = await setup();
    const r = await registerResource(db, VID, { title: "Notes", kind: "markdown" });
    await linkResourceToCourse(db, { courseId: course.id, resourceId: r.id, role: "reference" });
    await deleteResource(db, r.id);

    expect(await getResource(db, r.id)).toBeNull();
    expect(await listCourseResources(db, course.id)).toHaveLength(0);
    const links = await db.select("SELECT * FROM course_resources WHERE resource_id = ?", [r.id]);
    expect(links).toHaveLength(0);
  });
});
