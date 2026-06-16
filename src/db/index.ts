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
export * from "./repositories/campaigns";

// Feature 008: read-only dashboard read-model (aggregate summary over the core hierarchy).
export * from "./repositories/dashboard";

// Feature 009: per-vault dataset bookkeeping (vault records + adoption of pre-feature data).
export * from "./repositories/vaults";

// Feature 005: the vault-write fingerprint record (conflict detection). Consumed by the vault
// layer's VaultWriteLog at its composition root.
export * from "./repositories/vaultWrites";

// Feature 006: generic app-state key-value settings (e.g. the configured vault path).
export * from "./repositories/settings";

// Feature 010: SRS cards + reviews (the FSRS engine + review transaction live in src/features/srs).
export * from "./repositories/cards";
export * from "./repositories/reviews";
// Feature 010: the Resource registry + card↔resource citations.
export * from "./repositories/resources";
export * from "./repositories/cardResources";
// Feature 012: Daily Loop sessions (sessions + assignments + pretest; tables exist since m0001).
export * from "./repositories/sessions";
// Feature 015: Projects (applied practice) — projects + project_milestones/_resources (m0001),
// title column added in m0008.
export * from "./repositories/projects";

// Feature 018: Feynman/Socratic Tutor — gap tracking (m0010).
export * from "./repositories/feynmanGaps";

// Feature 021: Interleaving Scheduler — course prerequisite tracking (m0012).
export * from "./repositories/courseDependencies";

// Feature 022: Research Agent — research sources + learning profiles.
export * from "./repositories/research";

// Feature 023: Session Sources — per-source completion for Daily Loop enrichment.
export * from "./repositories/sessionSources";

// Dashboard activity queries (streak, sessions, heatmap).
export * from "./repositories/activity";

export { metadataSchemaFor, type ResourceMetadata } from "./models/resourceMetadata";
