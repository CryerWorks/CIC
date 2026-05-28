# Quickstart: SQLite Data Layer

**Feature**: 003-sqlite-data-layer · **Date**: 2026-05-27

Goal: confirm the app creates and migrates its local store on launch, and that the data layer round-trips entities with integrity. This layer has **no UI** — verification is via the running app's store file + the test suite.

## Prerequisites

Features 001–002 runnable. Node 24 (for the `node:sqlite` test adapter — already installed). The Tauri SQL plugin pulls a Rust dep, so the first `tauri dev` after this feature recompiles the shell.

## Run it

```powershell
npm install          # @tauri-apps/plugin-sql (JS)
npm run tauri dev    # app starts → bootstrap loads sqlite:cic.db + runs migrations
```

On first launch the store is created in the app config directory and migrated to the latest schema version. Nothing visible changes yet (no UI) — the proof is the store file existing with the schema, and the tests below.

## Verify the feature (tests — the real acceptance surface)

```powershell
npm run test         # the db suite runs against node:sqlite via the SqlExecutor seam
```

| Check | Backs |
|---|---|
| Migration runner: fresh apply → all 17 tables; second run applies 0; version bump applies only the new one | FR-007 / SC-004 |
| Newer-than-app store is refused | FR-008 / SC-005 |
| Lossless upgrade: rows inserted at v1 survive a v2 column-add | SC-005 |
| Per-entity round-trip: insert one of each entity, read it back parsed | FR-002 / SC-001 |
| FK enforcement: inserting a child with a dangling parent is rejected | FR-003 / SC-003 |
| Validation: bad enum / malformed JSON / out-of-range confidence rejected, no partial row | FR-004 / SC-003 |
| Cascade: delete a course → its milestones/sessions/cards go; linked resources survive (links removed) | FR-003 / FR-005 |

## Add the next migration (for a future feature)

1. Create `src/db/migrations/m0002_<name>.ts` exporting `{ version: 2, name, sql }`.
2. Register it (in order) in `src/db/migrations/index.ts`.
3. **Never edit `m0001_initial`** (or any shipped migration) — schema changes are always a *new* migration (migration contract rule 8).
4. Add a model/zod schema for any new entity in `src/db/models/`.
5. Add a test: the new migration applies losslessly over a v1 store.

## Inspect the store (optional)

The DB file lives in the OS app-config directory under the app's identifier (`com.cryerworks.cic`), named `cic.db`. Open it with any SQLite browser to confirm the schema. It contains **no note bodies** — only tracking rows and `*_path` string links (Constitution I).

## Troubleshooting

- **`node:sqlite` warning/error under Vitest**: it's experimental in Node; if it fails to load, the `SqlExecutor` seam lets us swap the test adapter to `better-sqlite3` (research R3) — one file.
- **FK violations not raised**: confirm the adapter set `PRAGMA foreign_keys = ON` (sqlx defaults it on in prod; the node adapter sets it explicitly). The FK test is the canary.
- **`sql.execute` not permitted at runtime**: the `sql:allow-execute` capability is missing from `src-tauri/capabilities/default.json`.

## Out of scope (so you don't look for it)

No vector store / embeddings, no Course Blueprint, no FSRS scheduling, no vault read/write, no UI. Those are later features; the schema leaves seams ready (`cards.fsrs_state`, `resources.ingested_at`, `vault_writes`).
