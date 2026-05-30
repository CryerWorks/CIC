import type { Migration } from "../migrate";

/**
 * Feature 015 (Projects MVP, PRD F11) — the applied-practice authoring layer. Additive only
 * (research R1), schema 7 → 8. The Projects schema itself (`projects`, `project_milestones`,
 * `project_resources`, and the nullable `sessions.project_id` / `cards.project_id` FKs) already
 * shipped in `m0001_initial`; this only fills the gaps authoring needs:
 *
 * - `projects.title` — a short human label, distinct from the `capability` *sentence*. The DB-only
 *   dashboard read-model lists active Projects without touching the vault, so it needs a label in
 *   SQL. `NOT NULL DEFAULT ''` is a DDL formality: the table has zero rows today and the repo/form
 *   always supply a non-empty title, so the default is never materialized (mirrors `courses.title`'s
 *   not-null contract).
 * - `idx_sessions_project_id` / `idx_cards_project_id` — index the `project_id` FKs (the dashboard
 *   "active projects" + "sessions touching a project" reads). `idx_projects_course_id` already exists.
 *
 * No table rebuild — safe under the idempotent runner + the pooled adapter (`ADD COLUMN` is guarded
 * by `columnExists` + the Feature-012 "duplicate column name" self-heal; the indexes use
 * `IF NOT EXISTS`). IMMUTABLE once shipped.
 */
export const m0008ProjectAuthoring: Migration = {
  version: 8,
  name: "project_authoring",
  sql: `
ALTER TABLE projects ADD COLUMN title TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_cards_project_id ON cards(project_id);
`.trim(),
};
