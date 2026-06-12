import type { Migration } from "../migrate";

export const m0010FeynmanGaps: Migration = {
  version: 10,
  name: "feynman_gaps",
  sql: `
CREATE TABLE IF NOT EXISTS feynman_gaps (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  note_path TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feynman_gaps_vault ON feynman_gaps(vault_id);
CREATE INDEX IF NOT EXISTS idx_feynman_gaps_course ON feynman_gaps(course_id);
`.trim(),
};
