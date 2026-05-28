# Research: SQLite Data Layer

**Feature**: 003-sqlite-data-layer · **Date**: 2026-05-27

All decisions resolve the Technical Context. No `NEEDS CLARIFICATION` remain. Plugin specifics confirmed against the Tauri v2 SQL plugin docs (v2.tauri.app/plugin/sql).

---

## R1 — tauri-plugin-sql wiring

**Decision**: Use `tauri-plugin-sql` with the `sqlite` feature. Rust: `cargo add tauri-plugin-sql --features sqlite`, then `.plugin(tauri_plugin_sql::Builder::default().build())` in `src-tauri/src/lib.rs`. JS: `npm i @tauri-apps/plugin-sql`, `Database.load("sqlite:cic.db")`. Capability: add `"sql:default"` + `"sql:allow-execute"` to `src-tauri/capabilities/default.json` (default already grants load/select/close). DB file lives in the app config directory (resolved from `sqlite:cic.db`).

**Rationale**: It's the constitution-locked native bridge for SQLite. `Builder::default().build()` (no Rust-side migrations) keeps the Rust touch to three lines — schema lives in TS (R2). Parameterized queries use `$1, $2…` placeholders.

**Alternatives considered**: A raw `rusqlite` Rust layer — rejected: more custom Rust, off the locked-plugin path. `Database.load` at call sites vs. a `preload` in `tauri.conf.json` — we load once in `bootstrap.ts` (composition root) and pass the executor down.

---

## R2 — Own TS migration runner (not plugin Rust-migrations), via `PRAGMA user_version`

**Decision**: Do **not** use the plugin's `add_migrations` (Rust). Implement a forward-only runner in `src/db/migrate.ts`: read `PRAGMA user_version`; for each registered migration with `version > user_version` (ascending), run its SQL inside a transaction and set `PRAGMA user_version = version`; if none pending, do nothing. Migrations are TS modules (`{ version, name, sql }`) in `src/db/migrations/`; v1 is the full §8 schema.

**Rationale**: Keeps the schema and its evolution in TypeScript (the `src/db` spine, Constitution IV; "stay in TypeScript"), versionable and reviewable in one place, and — crucially — **runnable through the `SqlExecutor` seam (R3)**, so the runner is unit-testable without the Tauri runtime. `user_version` is SQLite's built-in, zero-table version stamp. Forward-only matches a personal single-user store (no down-migrations needed; reversibility would be untested theater).

**Alternatives considered**: Plugin Rust `Migration` structs — rejected: schema would live in Rust, untestable in Vitest, and split from the models. A `schema_migrations` table — heavier than `user_version` for a single linear history; revisit only if branching/"applied-at" history is ever needed.

---

## R3 — The `SqlExecutor` seam + `node:sqlite` test adapter (the testability keystone)

**Decision**: Define a thin interface `SqlExecutor { execute(sql, params?), select<T>(sql, params?), transaction(fn) }` in `src/db/executor.ts`. Production adapter `adapters/tauri.ts` wraps `@tauri-apps/plugin-sql` (the **only** importer of it). Test adapter `adapters/node.ts` wraps Node 24's built-in `node:sqlite` (`DatabaseSync`), imported **only by tests**. The migration runner, repositories, and round-trip/integrity tests all depend on `SqlExecutor`.

**Rationale**: `@tauri-apps/plugin-sql` calls into the Rust runtime and cannot run in Vitest/jsdom. Without a seam, FR-011/SC-008 (tested migrations, FK enforcement, round-trips, validation) would be impossible to satisfy at unit level. `node:sqlite` is real SQLite with the same dialect, so DDL/queries/constraints behave identically — the tests exercise genuine SQLite semantics (FK violations, CHECK constraints, transactions). This is the same interface-first/deep-module shape as the AI provider adapters (Constitution IV), and it future-proofs a possible engine swap.

**Alternatives considered**: *No seam, e2e-only tests* — rejected: slow, can't run in CI Vitest, leaves the data layer effectively untested per-PR. *`better-sqlite3` for tests* — viable and battle-tested, but a native dependency requiring node-gyp; `node:sqlite` is zero-dependency and built into the installed Node 24. **Risk/mitigation**: `node:sqlite` is still marked experimental and may emit a warning or need `--experimental-sqlite` on some Node builds; if it proves flaky under Vitest workers, fall back to `better-sqlite3` (the `SqlExecutor` seam makes that a one-file change).

---

## R4 — Foreign-key enforcement + cascade policy

**Decision**: Rely on FK enforcement being **on**. sqlx (which `tauri-plugin-sql` uses) sets `PRAGMA foreign_keys = ON` per connection by default; the test adapter explicitly runs `PRAGMA foreign_keys = ON` on open. Define FKs with explicit `ON DELETE` behavior: **owned children cascade** (a Course's milestones/sessions/cards `ON DELETE CASCADE`); **M:N join rows cascade from both parents** (deleting a Course removes its `course_resources` rows but never the shared `resources` row); nullable optional FKs (`sessions.project_id`, `cards.project_id`) `ON DELETE SET NULL`. An **FK-violation test** (insert a child with a dangling parent → rejected) is the proof enforcement is live (SC-003).

**Rationale**: Correct integrity without app-layer bookkeeping where the engine can do it. The test is the safety net: if enforcement were somehow off, the FK test fails loudly rather than silently allowing orphans. Cascade choices follow ownership: children are meaningless without their parent; shared resources outlive any one referencer.

**Alternatives considered**: *App-layer existence checks only* — rejected: duplicates what SQLite does correctly and is easy to forget. *`RESTRICT` everywhere* — rejected: would force manual child-cleanup for ordinary course deletion. We still wrap multi-row deletes in transactions (R7).

---

## R5 — Identifiers and timestamps

**Decision**: **String UUID primary keys** (`crypto.randomUUID()`, available in both the webview and Node) for app-generated entities. **Timestamps as ISO-8601 UTC text** (e.g. `2026-05-27T14:30:00.000Z`); the `streaks` date key and any date-only fields are `YYYY-MM-DD` text. Money/duration/counts are integers.

**Rationale**: Milestone/course/project IDs are cross-referenced from **vault frontmatter** and the generation **Blueprint IR**; stable, collision-free, app-generated UUIDs let those references be written before a DB round-trip and stay valid across export/import. ISO-8601 text is lexicographically sortable, human-readable in the DB, and unambiguous (UTC) — worth more than the bytes an integer epoch would save at personal scale.

**Alternatives considered**: *Integer `AUTOINCREMENT` rowids* — rejected: simpler, but IDs aren't known until insert (bad for vault cross-refs) and aren't portable across stores. *Epoch-millis integers for time* — sortable too, but less legible when inspecting the DB; ISO text wins for a debuggable personal tool.

---

## R6 — Enums and JSON columns: defense in depth

**Decision**: Enumerated fields are `TEXT` with a `CHECK (col IN (...))` constraint in the DDL **and** a `z.enum([...])` at the TS boundary. JSON columns (`cards.fsrs_state`, `resources.metadata`, `streaks.domains_touched`) are `TEXT` holding JSON, written via `JSON.stringify` and read via a zod schema that `JSON.parse`s and validates the shape. The single source of enum truth is `src/db/models/enums.ts`; the DDL `CHECK` lists mirror it.

**Rationale**: FR-004 demands invalid writes be rejected. The DB `CHECK` is the last line (catches any path that bypasses the model); zod is the first line (clear errors, typed values, parses JSON). `cards.fsrs_state` stays opaque-but-validated here — its internal shape is owned by the SRS feature; 003 only guarantees it's well-formed JSON. **`reviews.confidence` has no DB default and no zod default** — null is allowed, but the value is never auto-filled (Constitution III / F3.5).

**Alternatives considered**: *zod-only (no CHECK)* — rejected: a raw SQL path could insert garbage. *CHECK-only* — rejected: poor error messages, no parsed types, no JSON-shape validation.

---

## R7 — Atomicity: no partial writes

**Decision**: Multi-statement operations (a migration, a create-with-children, a delete that cascades, any multi-row mutation) run inside a **transaction** exposed by `SqlExecutor.transaction(fn)` — commit on success, roll back on any error. Single-row writes validate via zod *before* the statement runs, so a rejected value never reaches SQLite.

**Rationale**: FR-004/SC-003 require that a rejected or failed write leaves **no** partial record. zod-before-write handles validation failures; transactions handle mid-operation SQL failures. Both adapters support transactions (sqlx + `node:sqlite`).

**Alternatives considered**: *Autocommit per statement* — rejected: a failure mid-sequence would leave partial state. *Savepoints/nested tx* — unneeded at this scope; revisit if nested units of work appear.

---

## Open questions

None. Vector store / embeddings, the Course Blueprint IR, FSRS scheduling logic, and the vault layer are out of scope (spec). One carried **risk**: `node:sqlite`'s experimental status under Vitest (R3) — mitigated by the `SqlExecutor` seam and a documented `better-sqlite3` fallback.
