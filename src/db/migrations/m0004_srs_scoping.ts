import type { Migration } from "../migrate";

/**
 * Feature 010 — SRS scoping + citations. Additive only (research R9): a nullable
 * `resources.vault_id` (so the Resource registry is vault-scoped like Feature 009's domains, not a
 * cross-vault leak) + its index, and a nullable `cards.note_block_id` (the Obsidian block-id of a
 * card's cited note paragraph, F3.6). No table rebuilds — safe under the FK-on, transaction-wrapped
 * runner and the pooled production adapter. New columns back-fill NULL; existing rows are intact.
 * IMMUTABLE once shipped.
 */
export const m0004SrsScoping: Migration = {
  version: 4,
  name: "srs_scoping",
  sql: `
ALTER TABLE resources ADD COLUMN vault_id TEXT REFERENCES vaults(id);
CREATE INDEX IF NOT EXISTS idx_resources_vault_id ON resources(vault_id);
ALTER TABLE cards ADD COLUMN note_block_id TEXT;
`.trim(),
};
