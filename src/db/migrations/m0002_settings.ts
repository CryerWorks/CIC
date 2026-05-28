import type { Migration } from "../migrate";

/**
 * Feature 006 — the generic app-state key-value store. The first schema evolution past
 * `m0001` (exercising the forward-only runner). Holds small local settings such as the
 * configured vault folder (`vault.path`); never vault content.
 */
export const m0002Settings: Migration = {
  version: 2,
  name: "settings",
  sql: `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`.trim(),
};
