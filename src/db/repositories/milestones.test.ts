// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import {
  createMilestone,
  listMilestonesByCourse,
  updateMilestone,
  deleteMilestone,
} from "./milestones";

async function courseDb() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: "vault-1", path: "/vault" });
  const domain = await createDomain(db, "vault-1", { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "RA", domainId: domain.id });
  return { db, course };
}

describe("milestones repo additions (US2)", () => {
  it("updateMilestone patches only the provided fields", async () => {
    const { db, course } = await courseDb();
    const m = await createMilestone(db, { courseId: course.id, capability: "Define a limit", orderIndex: 0 });

    const renamed = await updateMilestone(db, m.id, { capability: "Define a limit rigorously" });
    expect(renamed.capability).toBe("Define a limit rigorously");
    expect(renamed.status).toBe("todo");

    const advanced = await updateMilestone(db, m.id, { status: "done", orderIndex: 3 });
    expect(advanced.status).toBe("done");
    expect(advanced.order_index).toBe(3);
    expect(advanced.capability).toBe("Define a limit rigorously");
  });

  it("deleteMilestone removes the row", async () => {
    const { db, course } = await courseDb();
    const m = await createMilestone(db, { courseId: course.id, capability: "Temp", orderIndex: 0 });
    await deleteMilestone(db, m.id);
    expect(await listMilestonesByCourse(db, course.id)).toHaveLength(0);
  });
});
