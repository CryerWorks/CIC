import type { SqlExecutor } from "../executor";
import { MilestoneSchema, type Milestone } from "../models/milestone";
import type { MilestoneStatus } from "../models/enums";
import { insert, selectParsed } from "./query";

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
