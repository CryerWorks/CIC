import type { Migration } from "../migrate";

export const m0012CourseDependencies: Migration = {
  version: 12,
  name: "course_dependencies",
  sql: `
CREATE TABLE IF NOT EXISTS course_dependencies (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  prereq_course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(course_id, prereq_course_id)
);
CREATE INDEX IF NOT EXISTS idx_course_dependencies_course ON course_dependencies(course_id);
CREATE INDEX IF NOT EXISTS idx_course_dependencies_prereq ON course_dependencies(prereq_course_id);
`.trim(),
};
