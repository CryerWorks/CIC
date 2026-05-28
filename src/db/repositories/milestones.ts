import type { SqlExecutor } from "../executor";
import { MilestoneSchema, type Milestone } from "../models/milestone";
import type { MilestoneStatus } from "../models/enums";
import { insert, selectParsed, update, upsert } from "./query";

export async function createMilestone(
  db: SqlExecutor,
  input: { courseId: string; capability: string; orderIndex: number; status?: MilestoneStatus },
): Promise<Milestone> {
  const row: Milestone = {
    id: crypto.randomUUID(),
    course_id: input.courseId,
    capability: input.capability,
    status: input.status ?? "todo",
    order_index: input.orderIndex,
  };
  await insert(db, "milestones", row);
  return MilestoneSchema.parse(row);
}

export async function listMilestonesByCourse(
  db: SqlExecutor,
  courseId: string,
): Promise<Milestone[]> {
  return selectParsed(
    db,
    MilestoneSchema,
    "SELECT * FROM milestones WHERE course_id = ? ORDER BY order_index",
    [courseId],
  );
}

/** Patch a Milestone (Feature 007 — edit / reorder). Returns the parsed, updated row. */
export async function updateMilestone(
  db: SqlExecutor,
  id: string,
  patch: { capability?: string; status?: MilestoneStatus; orderIndex?: number },
): Promise<Milestone> {
  const set: Record<string, unknown> = {};
  if (patch.capability !== undefined) set.capability = patch.capability;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.orderIndex !== undefined) set.order_index = patch.orderIndex;
  if (Object.keys(set).length > 0) await update(db, "milestones", set, { id });
  const rows = await selectParsed(db, MilestoneSchema, "SELECT * FROM milestones WHERE id = ?", [id]);
  if (!rows[0]) throw new Error(`Milestone ${id} not found`);
  return rows[0];
}

export async function deleteMilestone(db: SqlExecutor, id: string): Promise<void> {
  await db.execute("DELETE FROM milestones WHERE id = ?", [id]);
}

/** Make a Course's milestones match `desired` (read-back, Feature 007): upsert each by id with
 *  its array position as `order_index`, and delete any existing milestone not in the set. The
 *  file is authoritative for the managed section. Returns the resulting ordered list. */
export async function syncCourseMilestones(
  db: SqlExecutor,
  courseId: string,
  desired: { id: string; capability: string; status: MilestoneStatus }[],
): Promise<Milestone[]> {
  const desiredIds = new Set(desired.map((d) => d.id));
  for (const current of await listMilestonesByCourse(db, courseId)) {
    if (!desiredIds.has(current.id)) await deleteMilestone(db, current.id);
  }
  let order = 0;
  for (const d of desired) {
    const row: Milestone = {
      id: d.id,
      course_id: courseId,
      capability: d.capability,
      status: d.status,
      order_index: order,
    };
    await upsert(db, "milestones", row, ["id"]);
    order += 1;
  }
  return listMilestonesByCourse(db, courseId);
}
