import type { Migration } from "../migrate";

/**
 * Feature 011 — Resource "home Domain". Additive only (research R5): a nullable
 * `resources.domain_id` (+ index) so the registry can be filed/filtered by Domain (FR-012). No
 * table rebuild — safe under the idempotent, transaction-wrapped runner and the pooled adapter.
 *
 * `ON DELETE SET NULL` (analyze C1): Domains are user-deletable (Feature 004) with FK enforcement
 * on, so a NO-ACTION FK would make deleting a Domain that has Resources filed under it *fail*.
 * SET NULL unfiles those Resources instead (the Domain delete succeeds; the Resource survives).
 * IMMUTABLE once shipped.
 */
export const m0005ResourceDomain: Migration = {
  version: 5,
  name: "resource_domain",
  sql: `
ALTER TABLE resources ADD COLUMN domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_resources_domain_id ON resources(domain_id);
`.trim(),
};
