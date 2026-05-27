# Contract: `src/db` Public Interface

**Feature**: 003-sqlite-data-layer · **Date**: 2026-05-27

The persistence spine's public surface. Features (004+) depend on **this**, never on raw SQL or `@tauri-apps/plugin-sql`. Constitution IV: thin interface, deep implementations.

## `SqlExecutor` (the seam) — `src/db/executor.ts`

The single low-level abstraction every higher layer is built on. Both adapters implement it identically.

```ts
export interface SqlExecutor {
  /** Run a write/DDL statement. Returns rows affected + last insert id (if any). */
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  /** Run a query; returns raw rows (callers parse via zod). */
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run `fn` inside a transaction; commit on resolve, roll back on throw. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
```

- Parameterized queries only — positional `?` placeholders (the one style both sqlx and `node:sqlite` bind identically, so a single SQL string works on both adapters); **never** string-interpolate values (injection + correctness). The lone exception is `PRAGMA user_version = <int>`, which cannot be bound and only ever takes a trusted integer from a registered migration.
- **Adapters** (deep): `adapters/tauri.ts` (production — the *only* importer of `@tauri-apps/plugin-sql`), `adapters/node.ts` (tests — `node:sqlite`, sets `PRAGMA foreign_keys = ON` on open). App code never imports the node adapter.

## Migration runner — `src/db/migrate.ts`

```ts
export interface Migration { version: number; name: string; sql: string; }
/** Apply all registered migrations with version > current PRAGMA user_version, in order,
 *  each in a transaction, bumping user_version. Idempotent. Throws if the store's version
 *  exceeds the latest known migration (newer-than-app → refuse). */
export function migrate(db: SqlExecutor, migrations?: Migration[]): Promise<{ from: number; to: number; applied: number }>;
```

Contract rules live in [migration-contract.md](migration-contract.md).

## Models — `src/db/models/*`

- One zod schema + inferred type per entity (`Domain`, `Course`, `Milestone`, …) and the enums (`enums.ts`).
- **Read path**: `Schema.parse(row)` — every row is validated before a feature sees it (booleans normalized, JSON parsed, enums checked). Parse failure → clear thrown error, never a crash.
- **Write path**: validate the input model *before* issuing SQL (no partial writes).

## Repositories — `src/db/repositories/*`

- **`query.ts`** — generic helpers: `selectParsed(db, schema, sql, params)` (select + zod-parse each row), and small insert/update builders. Sufficient to round-trip *any* entity (covers US2's "one of each" without per-table code).
- **Core-hierarchy repos** (`domains.ts`, `courses.ts`, `milestones.ts`) — ergonomic typed CRUD for the spine entities exercised by US1. Repositories for sessions/cards/resources/projects arrive **with the features that consume them** (no organizational-only code now — Constitution IV).

## Composition root — `src/db/bootstrap.ts`

```ts
/** Production startup: build the Tauri executor, load sqlite:cic.db, run migrate(). Returns the executor. */
export function initDatabase(): Promise<SqlExecutor>;
```

Called once at app start (from the app entry). Tests build a `node:sqlite` executor directly and call `migrate()` — they never call `initDatabase()`.

## Public barrel — `src/db/index.ts`

Re-exports the `SqlExecutor` type, `migrate`, the models/enums, the core repositories, and `initDatabase`. The kit's stable surface.

## Stability

The `SqlExecutor` shape, `migrate()` signature, entity model names, and the migration rules are a **public contract** for Features 004+. Adding a model/repo/migration is additive; changing `SqlExecutor`, an entity's fields, or migration semantics is breaking. **Existing migrations are immutable once shipped** (you add a new one; you never edit a released migration — see migration contract).
