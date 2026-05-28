import type { Migration } from "../migrate";

/**
 * Feature 009 — per-vault data partitioning. Additive only (research R3): a `vaults` table plus a
 * nullable `domains.vault_id` link + its index. A `domains` table-rebuild is deliberately avoided —
 * under the FK-on, transaction-wrapped runner (and the pooled production adapter) `DROP TABLE domains`
 * would cascade-delete the whole hierarchy. Existing rows back-fill `vault_id` NULL and are adopted
 * at runtime by the first vault attached (FR-008). The global `domains.name` UNIQUE is retained
 * (per-vault names deferred — research R8). IMMUTABLE once shipped.
 */
export const m0003Vaults: Migration = {
  version: 3,
  name: "vaults",
  sql: `
CREATE TABLE IF NOT EXISTS vaults (
  id         TEXT PRIMARY KEY,
  path       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
ALTER TABLE domains ADD COLUMN vault_id TEXT REFERENCES vaults(id);
CREATE INDEX IF NOT EXISTS idx_domains_vault_id ON domains(vault_id);
`.trim(),
};
