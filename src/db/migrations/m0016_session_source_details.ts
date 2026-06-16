import type { Migration } from "../migrate";

export const m0016SessionSourceDetails: Migration = {
  version: 16,
  name: "session_source_details",
  sql: `
ALTER TABLE session_sources ADD COLUMN thumbnail_url TEXT DEFAULT '';
ALTER TABLE session_sources ADD COLUMN start_page INTEGER;
ALTER TABLE session_sources ADD COLUMN end_page INTEGER;
ALTER TABLE session_sources ADD COLUMN start_seconds INTEGER;
ALTER TABLE session_sources ADD COLUMN end_seconds INTEGER;
ALTER TABLE session_sources ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE session_sources ADD COLUMN completed INTEGER DEFAULT 0;
`.trim(),
};
