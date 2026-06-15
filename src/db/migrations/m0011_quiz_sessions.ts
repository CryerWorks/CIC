import type { Migration } from "../migrate";

export const m0011QuizSessions: Migration = {
  version: 11,
  name: "quiz_sessions",
  sql: `
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  questions TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_vault ON quiz_sessions(vault_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_course ON quiz_sessions(course_id);
`.trim(),
};
