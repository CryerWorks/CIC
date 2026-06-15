/**
 * Quiz sessions repository (Feature 019). Persists completed quiz sessions
 * to SQLite so learners can review past quiz history and surface-form variability
 * can draw on previous questions for the same course.
 */
import { z } from "zod";
import type { SqlExecutor } from "../executor";
import { selectParsed, insert } from "./query";

/** Input for inserting a quiz session row. */
export interface QuizSessionInsert {
  id: string;
  vaultId: string;
  courseId: string | null;
  topic: string;
  questions: string;
}

/** Zod schema for quiz_sessions DB rows read back from SELECT. */
export const QuizSessionRowSchema = z.object({
  id: z.string(),
  vault_id: z.string(),
  course_id: z.string().nullable(),
  topic: z.string(),
  questions: z.string(),
  created_at: z.string(),
});

export type QuizSessionRow = z.infer<typeof QuizSessionRowSchema>;

/** Insert a completed quiz session. */
export async function insertQuizSession(
  db: SqlExecutor,
  input: QuizSessionInsert,
): Promise<void> {
  await insert(db, "quiz_sessions", {
    id: input.id,
    vault_id: input.vaultId,
    course_id: input.courseId,
    topic: input.topic,
    questions: input.questions,
  });
}

/** Get the most recent quiz session for a given course and vault. */
export async function getLastQuizForCourse(
  db: SqlExecutor,
  vaultId: string,
  courseId: string,
): Promise<QuizSessionRow | null> {
  const rows = await selectParsed(
    db,
    QuizSessionRowSchema,
    `SELECT * FROM quiz_sessions
     WHERE vault_id = ? AND course_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [vaultId, courseId],
  );
  return rows[0] ?? null;
}
