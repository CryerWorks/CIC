import type { SqlExecutor } from "../executor";
import { CourseSchema, type Course } from "../models/course";
import { insert, selectParsed, update, upsert } from "./query";

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

/** All Courses in the active vault (Feature 009 — scoped via the owning Domain). The screen groups
 *  them by Domain. Ordered by title. */
export async function listCourses(db: SqlExecutor, vaultId: string): Promise<Course[]> {
  return selectParsed(
    db,
    CourseSchema,
    `SELECT c.* FROM courses c
     JOIN domains d ON d.id = c.domain_id
     WHERE d.vault_id = ?
     ORDER BY c.title`,
    [vaultId],
  );
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

/** Delete a Course (Feature 007). ON DELETE CASCADE removes its milestones, course_resources,
 *  and other descendants. The vault MOC is reconciled separately by the sync layer (detach or
 *  hard-delete) — the DB never touches `.md`. */
export async function deleteCourse(db: SqlExecutor, id: string): Promise<void> {
  await db.execute("DELETE FROM courses WHERE id = ?", [id]);
}

/** All non-null MOC paths across every vault — for slug-collision avoidance when minting a new
 *  MOC filename (Feature 007). Intentionally unscoped: a vault-relative path being free in the
 *  active vault is what matters, and being conservative across vaults is harmless. */
export async function listCourseMocPaths(db: SqlExecutor): Promise<string[]> {
  const rows = await db.select<{ moc_path: string | null }>(
    "SELECT moc_path FROM courses WHERE moc_path IS NOT NULL",
  );
  return rows.map((r) => r.moc_path).filter((p): p is string => p !== null);
}

/** Find a Course by its MOC path (read-back helper). */
export async function getCourseByMocPath(db: SqlExecutor, mocPath: string): Promise<Course | null> {
  const rows = await selectParsed(db, CourseSchema, "SELECT * FROM courses WHERE moc_path = ?", [mocPath]);
  return rows[0] ?? null;
}

/** Id-preserving create-or-update (read-back import, Feature 007). Idempotent on PK `id`. */
export async function upsertCourseRow(
  db: SqlExecutor,
  row: { id: string; title: string; domainId: string; campaignId: string | null; mocPath: string | null },
): Promise<Course> {
  const record: Course = {
    id: row.id,
    title: row.title,
    domain_id: row.domainId,
    campaign_id: row.campaignId,
    moc_path: row.mocPath,
  };
  await upsert(db, "courses", record, ["id"]);
  return CourseSchema.parse(record);
}
