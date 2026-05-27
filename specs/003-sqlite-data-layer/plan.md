# Implementation Plan: SQLite Data Layer

**Branch**: `003-SQL-data-layer` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-sqlite-data-layer/spec.md`

## Summary

Establish CIC's local persistence foundation: the `src/db/` spine. Wire `tauri-plugin-sql` (SQLite), a forward-only versioned TS migration runner, the full PRD §8 relational tracking schema (17 tables — FKs, enums, JSON columns, M:N joins), and zod-validated row models. Knowledge stays in the vault; SQLite holds tracking/SRS state and `*_path` string links only. The layer sits behind a thin `SqlExecutor` interface so it is testable in Vitest against real SQLite (`node:sqlite`) while production runs the Tauri plugin. No UI, no AI, no vault access.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) · Rust (one plugin-registration touch in `src-tauri/`)

**Primary Dependencies**: `tauri-plugin-sql` (Rust, `sqlite` feature) + `@tauri-apps/plugin-sql` (JS) · `zod` (validation) · `node:sqlite` (Node 24 built-in — **test adapter only**) · Vitest (from 001)

**Storage**: Local SQLite file in the app config directory (`sqlite:cic.db`). This *is* the storage this feature builds.

**Testing**: Vitest — migration runner (fresh apply / idempotent re-run / version bump), schema creation, FK enforcement, per-entity round-trip, zod parse/reject. Run against a `node:sqlite` in-memory DB via the `SqlExecutor` seam (real SQLite, no Tauri runtime).

**Target Platform**: Windows 11 desktop (the 001 shell). SQLite/sqlx is cross-platform.

**Project Type**: Desktop app — adds an internal data layer (`src/db/`), no new UI surface.

**Performance Goals**: Personal scale (thousands of rows over years). Migrations apply in < 1 s on a fresh DB; queries are interactive-instant. No web-scale concerns.

**Constraints**: Fully local — zero network (FR-010). Atomic, validated writes (FR-004). Referential integrity enforced (FR-003). Knowledge never stored here (FR-006 / Constitution I). Migrations forward-only, idempotent, lossless (FR-007/008).

**Scale/Scope**: 17 tables · full zod model set · migration runner · `SqlExecutor` seam + 2 adapters · core-hierarchy repositories + generic typed-query helper.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies to 003? | Status | Notes |
|---|---|---|---|
| **I. Vault is Canonical and Sacred** | Directly — separation of stores | ✅ PASS (upholds it) | SQLite holds tracking/SRS + `*_path` string links **only**; note bodies/knowledge never stored here (FR-006/SC-006). No `fs`/vault access. `vault_writes` records *metadata about* vault files (mtime+hash) to enable the later conflict UX — it does not read or write vault content. |
| **II. AI is Vendor-Agnostic Tutor** | No AI | ✅ PASS (vacuous) | No `Provider`, no SDK, no network. The vector store / embeddings are explicitly deferred to the RAG feature. |
| **III. Preserve Desirable Difficulty** | Stores SRS/pretest data | ✅ PASS | Schema only — **no logic** that smooths learning. `cards.fsrs_state` is an opaque column (no scheduling here); there is **no auto "learned" flag**; `reviews.confidence` is nullable with **no DB default** (an autofilled value would defeat F3.5 calibration). The store records engagement; it never manufactures it. |
| **IV. Interface-First, Deep Modules (Pocock)** | This feature *is* the `src/db/` spine | ✅ PASS | Thin seam `SqlExecutor` (execute/select/transaction); deep adapters (`adapters/tauri.ts` wraps the plugin — the **only** place `@tauri-apps/plugin-sql` is imported; `adapters/node.ts` wraps `node:sqlite`, test-only). Migration runner, models, and repositories are deep modules behind the spine's public surface; features will import the interface, never raw SQL or the plugin. Mirrors the AI-provider adapter rule. |
| **V. Spec-Driven Development** | Yes | ✅ PASS | Full Phase 1 doc set incl. the complete schema in `data-model.md`; git owned by user; end-of-feature walkthrough committed to; data-integrity surfaces tested (a constitution quality gate). |

**Technology constraints**: SQLite via `tauri-plugin-sql` ✅ (locked), TypeScript strict ✅, zod ✅, Vitest ✅. **One Rust touch** — registering the plugin in `src-tauri/lib.rs` + Cargo dep + a capability permission. This is standard plugin wiring, not custom native logic; flagged here per the constitution's "drop to Rust only when necessary, and flag it" rule.

**Gate result: PASS.** No violations; Complexity Tracking omitted.

## Project Structure

### Documentation (this feature)

```text
specs/003-sqlite-data-layer/
├── spec.md
├── plan.md                  # This file
├── research.md              # Phase 0 — plugin wiring, migration runner, SqlExecutor seam, FK/ids/time, testing
├── data-model.md            # Phase 1 — the FULL 17-table schema (columns, types, FKs, enums, cascade, JSON shapes)
├── quickstart.md            # Phase 1 — verify the store creates + migrates + round-trips; how to add a migration
├── contracts/
│   ├── db-interface.md      # Phase 1 — the src/db public surface: SqlExecutor, migrate(), models, repositories
│   └── migration-contract.md# Phase 1 — migration ordering/versioning/idempotency/upgrade-refusal rules
└── checklists/
    └── requirements.md      # Spec quality checklist (green)
```

### Source Code (repository root)

```text
src/
└── db/                          # the persistence spine (new)
    ├── executor.ts              # SqlExecutor INTERFACE (the seam) + shared SQL types
    ├── adapters/
    │   ├── tauri.ts             # prod adapter — ONLY import of @tauri-apps/plugin-sql
    │   └── node.ts              # test adapter — node:sqlite (imported by tests only, never app code)
    ├── migrate.ts               # forward-only runner: reads user_version, applies pending in order, idempotent
    ├── migrations/
    │   ├── index.ts             # ordered migration registry
    │   └── m0001_initial.ts     # the full PRD §8 schema as migration v1 (DDL string)
    ├── models/                  # zod schemas + inferred TS types for every entity + enums + JSON columns
    │   ├── enums.ts             # resourceKind, resourceRole, assignmentKind, projectStatus, milestoneStatus, rating…
    │   ├── domain.ts course.ts milestone.ts session.ts card.ts review.ts …  (one per entity)
    │   └── index.ts
    ├── repositories/            # typed CRUD for the core hierarchy (+ generic query helpers)
    │   ├── query.ts             # generic typed select/exec that parses rows through a zod schema
    │   └── courses.ts …         # ergonomic repos for Domain/Course/Milestone (others arrive with their features)
    ├── bootstrap.ts             # composition root: load db (tauri adapter) + run migrations at app start
    └── index.ts                 # the spine's public surface
src-tauri/
├── Cargo.toml                   # + tauri-plugin-sql (sqlite feature)
├── src/lib.rs                   # + .plugin(tauri_plugin_sql::Builder::default().build())
└── capabilities/default.json    # + "sql:default", "sql:allow-execute"
```

**Structure Decision**: `src/db/` is the Pocock spine the constitution names. The **`SqlExecutor` interface is the seam** (execute / select / transaction): the Tauri-plugin adapter is the production deep module (and the sole importer of `@tauri-apps/plugin-sql`, mirroring the AI vendor-import rule); the `node:sqlite` adapter is test-only. The migration runner, zod models, and repositories all depend on `SqlExecutor`, never the plugin — which is exactly what makes the data-integrity behaviors unit-testable in Vitest against real SQLite. Per-entity repositories are built only for the core hierarchy now (others arrive with the features that consume them — no organizational-only code). `bootstrap.ts` wires the production adapter and runs migrations on app start so the running app actually creates its store.

## Phase 0 — Research

See [research.md](research.md). Resolves: `tauri-plugin-sql` wiring + capabilities + db file location (R1); **own TS migration runner over plugin Rust-migrations**, via `PRAGMA user_version` (R2); the **`SqlExecutor` seam + node:sqlite test adapter** that makes the layer Vitest-testable (R3); **FK enforcement** — sqlx defaults `foreign_keys` ON; the FK test verifies it; cascade policy (R4); **string UUID primary keys** + **ISO-8601 UTC text timestamps** (R5); **enum + JSON-column strategy** — DB `CHECK` constraints *and* zod at the boundary (R6); transaction/atomicity approach for "no partial write" (R7). No unresolved `NEEDS CLARIFICATION`.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the complete 17-table schema: every column, type, nullability, FK + ON DELETE behavior, enum domain, and JSON-column shape; the entity-relationship overview; validation rules.
- [contracts/db-interface.md](contracts/db-interface.md) — the `src/db` public surface features depend on: the `SqlExecutor` interface, `migrate()`, the model/zod parse contract, and the core repositories. The interface other features build against (and must stay stable).
- [contracts/migration-contract.md](contracts/migration-contract.md) — the migration rules: monotonic versions, forward-only, applied-exactly-once, idempotent re-run, lossless upgrade, refuse-newer-than-app.
- [quickstart.md](quickstart.md) — run the app → store is created + migrated; how to verify round-trip/integrity; how to add the next migration safely.

## Complexity Tracking

No constitution violations — section intentionally empty.
