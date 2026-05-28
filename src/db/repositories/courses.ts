import type { SqlExecutor } from "../executor";
import { CourseSchema, type Course } from "../models/course";
import { insert, selectParsed, update } from "./query";

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

/** All Courses (the screen groups them by Domain). Ordered by title. */
export async function listCourses(db: SqlExecutor): Promise<Course[]> {
  return selectParsed(db, CourseSchema, "SELECT * FROM courses ORDER BY title");
}

/** Patch mutable fields (Feature 007). Pass only what changes; returns the parsed, updated row. */
export async function updateCourse(
  db: SqlExecutor,
  id: string,
  patch: { title?: string; campaignId?: string | null; mocPath?: string | null },
): Promise<Course> {
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.campaignId !== undefined) set.campaign_id = patch.campaignId;
  if (patch.mocPath !== undefined) set.moc_path = patch.mocPath;
  if (Object.keys(set).length > 0) await update(db, "courses", set, { id });
  const rows = await selectParsed(db, CourseSchema, "SELECT * FROM courses WHERE id = ?", [id]);
  if (!rows[0]) throw new Error(`Course ${id} not found`);
  return rows[0];
}
