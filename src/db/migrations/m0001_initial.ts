import type { Migration } from "../migrate";
import {
  sqlEnum,
  MILESTONE_STATUS,
  PROJECT_STATUS,
  RESOURCE_KIND,
  RESOURCE_ROLE,
  ASSIGNMENT_KIND,
  REVIEW_RATING,
} from "../models/enums";

/**
 * Migration v1 — the full PRD §8 tracking schema (17 tables). IMMUTABLE once shipped:
 * future schema changes are always a NEW migration, never an edit here (migration contract
 * rule 8). Tables are created in dependency order (a referenced table before its referrer)
 * so every FK is valid at CREATE time. `IF NOT EXISTS` makes a partial-then-retried apply
 * safe even where the production adapter's pooled transaction can't span statements.
 *
 * Knowledge/tracking boundary (Constitution I): the only content columns are `cards.front`/
 * `cards.back` — SRS artifacts per §8. Everything else is tracking state or a `*_path`
 * string link into the vault. No note/MOC bodies live here.
 */
const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS domains (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS courses (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  domain_id   TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  moc_path    TEXT
);

CREATE TABLE IF NOT EXISTS milestones (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  capability  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN (${sqlEnum(MILESTONE_STATUS)})),
  order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  capability   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN (${sqlEnum(PROJECT_STATUS)})),
  opened_at    TEXT NOT NULL,
  closed_at    TEXT,
  project_path TEXT,
  template     TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  date          TEXT NOT NULL,
  objective     TEXT,
  minutes       INTEGER NOT NULL DEFAULT 0,
  did_retrieval INTEGER NOT NULL DEFAULT 0,
  writeup_path  TEXT
);

CREATE TABLE IF NOT EXISTS cards (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  note_path     TEXT,
  front         TEXT NOT NULL,
  back          TEXT NOT NULL,
  fsrs_state    TEXT,
  due_at        TEXT,
  last_reviewed TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating      TEXT NOT NULL CHECK (rating IN (${sqlEnum(REVIEW_RATING)})),
  confidence  INTEGER CHECK (confidence BETWEEN 1 AND 5),
  reviewed_at TEXT NOT NULL,
  elapsed_ms  INTEGER
);

CREATE TABLE IF NOT EXISTS streaks (
  date            TEXT PRIMARY KEY,
  minutes         INTEGER NOT NULL DEFAULT 0,
  domains_touched TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS pretest_responses (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question       TEXT NOT NULL,
  user_response  TEXT,
  revealed_after INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS resources (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN (${sqlEnum(RESOURCE_KIND)})),
  file_path   TEXT,
  url         TEXT,
  metadata    TEXT NOT NULL DEFAULT '{}',
  ingested_at TEXT,
  added_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_resources (
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN (${sqlEnum(RESOURCE_ROLE)})),
  PRIMARY KEY (course_id, resource_id)
);

CREATE TABLE IF NOT EXISTS session_assignments (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  resource_id     TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  locator         TEXT,
  assignment_kind TEXT NOT NULL CHECK (assignment_kind IN (${sqlEnum(ASSIGNMENT_KIND)}))
);

CREATE TABLE IF NOT EXISTS card_resources (
  card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  locator     TEXT,
  PRIMARY KEY (card_id, resource_id)
);

CREATE TABLE IF NOT EXISTS project_milestones (
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, milestone_id)
);

CREATE TABLE IF NOT EXISTS project_resources (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  locator     TEXT,
  PRIMARY KEY (project_id, resource_id)
);

CREATE TABLE IF NOT EXISTS vault_writes (
  file_path TEXT PRIMARY KEY,
  app_mtime TEXT NOT NULL,
  app_hash  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_domain_id ON campaigns(domain_id);
CREATE INDEX IF NOT EXISTS idx_courses_domain_id ON courses(domain_id);
CREATE INDEX IF NOT EXISTS idx_milestones_course_id ON milestones(course_id);
CREATE INDEX IF NOT EXISTS idx_projects_course_id ON projects(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_course_id ON sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_cards_course_id ON cards(course_id);
CREATE INDEX IF NOT EXISTS idx_cards_due_at ON cards(due_at);
CREATE INDEX IF NOT EXISTS idx_reviews_card_id ON reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_pretest_responses_session_id ON pretest_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_resources_kind ON resources(kind);
CREATE INDEX IF NOT EXISTS idx_course_resources_resource_id ON course_resources(resource_id);
CREATE INDEX IF NOT EXISTS idx_session_assignments_session_id ON session_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_session_assignments_resource_id ON session_assignments(resource_id);
CREATE INDEX IF NOT EXISTS idx_card_resources_resource_id ON card_resources(resource_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_milestone_id ON project_milestones(milestone_id);
CREATE INDEX IF NOT EXISTS idx_project_resources_resource_id ON project_resources(resource_id)
`;

export const m0001Initial: Migration = {
  version: 1,
  name: "initial",
  sql,
};
