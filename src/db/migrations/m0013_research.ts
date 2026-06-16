import type { Migration } from "../migrate";

export const m0013Research: Migration = {
  version: 13,
  name: "research",
  sql: `
CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'other' CHECK (source_type IN ('syllabus', 'courseware', 'textbook', 'video', 'article', 'other')),
  quality_score REAL,
  ingested_as_resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_research_sources_vault ON research_sources(vault_id);
CREATE INDEX IF NOT EXISTS idx_research_sources_type ON research_sources(source_type);

CREATE TABLE IF NOT EXISTS learning_profiles (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  declared_level TEXT NOT NULL CHECK (declared_level IN ('beginner', 'intermediate', 'advanced')),
  knowledge_text TEXT NOT NULL DEFAULT '',
  time_budget TEXT NOT NULL DEFAULT '',
  depth_goal TEXT NOT NULL CHECK (depth_goal IN ('overview', 'working', 'mastery')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_learning_profiles_vault ON learning_profiles(vault_id);
CREATE INDEX IF NOT EXISTS idx_learning_profiles_domain ON learning_profiles(domain);
`.trim(),
};
