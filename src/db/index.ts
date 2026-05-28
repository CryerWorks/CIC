/**
 * Public surface of the `src/db` persistence spine (Constitution IV). Features (004+) depend
 * on THIS — never on raw SQL, the migration files, the adapters, or `@tauri-apps/plugin-sql`.
 * (The node adapter is test-only and is deliberately NOT exported here.) Adding a model, repo,
 * or migration is additive; changing the seam, an entity's fields, or migration semantics is
 * breaking.
 */

// The seam + its result types.
export type { SqlExecutor, SqlValue, ExecuteResult } from "./executor";

// Schema versioning + production composition root.
export { migrate } from "./migrate";
export type { Migration } from "./migrate";
export { initDatabase } from "./bootstrap";

// Entity models, types, and enums (the enum value arrays are the single source the DDL mirrors).
export * from "./models";

// Generic typed-query helpers (round-trip any entity through its zod model).
export { selectParsed, insert, update, upsert, encodeValue } from "./repositories/query";

// Ergonomic typed CRUD for the core hierarchy. Repositories for the other entities arrive with
// the features that consume them (Constitution IV — no organizational-only code now).
export * from "./repositories/domains";
export * from "./repositories/courses";
export * from "./repositories/milestones";

// Feature 005: the vault-write fingerprint record (conflict detection). Consumed by the vault
// layer's VaultWriteLog at its composition root.
export * from "./repositories/vaultWrites";

// Feature 006: generic app-state key-value settings (e.g. the configured vault path).
export * from "./repositories/settings";
