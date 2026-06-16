import type { Migration } from "../migrate";

export const m0014SessionSources: Migration = {
  version: 14,
  name: "session_sources",
  sql: `
CREATE TABLE IF NOT EXISTS session_sources (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('reading', 'watching')),
  estimated_minutes INTEGER NOT NULL DEFAULT 30,
  ordering INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_session_sources_session ON session_sources(session_id);
`.trim(),
};
