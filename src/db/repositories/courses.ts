import type { SqlExecutor } from "../executor";
import { CourseSchema, type Course } from "../models/course";
import { insert, selectParsed } from "./query";

export async function createCourse(
  db: SqlExecutor,
  input: { title: string; domainId: string; campaignId?: string | null; mocPath?: string | null },
): Promise<Course> {
  const row: Course = {
    id: crypto.randomUUID(),
    title: input.title,
    domain_id: input.domainId,
    campaign_id: input.campaignId ?? null,
    moc_path: input.mocPath ?? null,
  };
  await insert(db, "courses", row);
  return CourseSchema.parse(row);
}

export async function getCourse(db: SqlExecutor, id: string): Promise<Course | null> {
  const rows = await selectParsed(db, CourseSchema, "SELECT * FROM courses WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function listCoursesByDomain(db: SqlExecutor, domainId: string): Promise<Course[]> {
  return selectParsed(
    db,
    CourseSchema,
    "SELECT * FROM courses WHERE domain_id = ? ORDER BY title",
    [domainId],
  );
}
