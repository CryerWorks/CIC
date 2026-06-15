import type { SqlExecutor } from "../executor";

/**
 * Course-to-prerequisite mapping (Feature 021 / F6). Rows record that `course_id` depends on
 * `prereq_course_id` — the scheduledr must not recommend a course whose declared prereqs have
 * zero completed sessions. Uniqueness enforced by `UNIQUE(course_id, prereq_course_id)`.
 * All references cascade on delete.
 */

export interface CourseDependency {
  id: string;
  course_id: string;
  prereq_course_id: string;
}

/** Declare that `courseId` has a prerequisite of `prereqCourseId`. Idempotent via UNIQUE. */
export async function addDependency(
  db: SqlExecutor,
  input: { courseId: string; prereqCourseId: string },
): Promise<CourseDependency> {
  const id = crypto.randomUUID();
  await db.execute(
    "INSERT INTO course_dependencies (id, course_id, prereq_course_id) VALUES (?, ?, ?)",
    [id, input.courseId, input.prereqCourseId],
  );
  return { id, course_id: input.courseId, prereq_course_id: input.prereqCourseId };
}

/** Remove one prerequisite link. No-op if the row doesn't exist. */
export async function removeDependency(
  db: SqlExecutor,
  courseId: string,
  prereqCourseId: string,
): Promise<void> {
  await db.execute(
    "DELETE FROM course_dependencies WHERE course_id = ? AND prereq_course_id = ?",
    [courseId, prereqCourseId],
  );
}

/** All declared prerequisites for `courseId`, ordered by prereq id. */
export async function getPrereqs(
  db: SqlExecutor,
  courseId: string,
): Promise<CourseDependency[]> {
  return db.select<CourseDependency>(
    "SELECT * FROM course_dependencies WHERE course_id = ? ORDER BY prereq_course_id",
    [courseId],
  );
}

/** All courses that declare `courseId` as a prerequisite, ordered by course id. */
export async function getDependents(
  db: SqlExecutor,
  courseId: string,
): Promise<CourseDependency[]> {
  return db.select<CourseDependency>(
    "SELECT * FROM course_dependencies WHERE prereq_course_id = ? ORDER BY course_id",
    [courseId],
  );
}
