# Contract: Migrations

**Feature**: 003-sqlite-data-layer · **Date**: 2026-05-27

How the schema is versioned and evolved. Backs FR-007/FR-008 and SC-004/SC-005.

## Rules

1. **Monotonic integer versions.** Migrations are numbered `1, 2, 3, …` with no gaps and no duplicates. Version 1 is the full PRD §8 schema (`m0001_initial`).
2. **Forward-only.** No down-migrations. A personal single-user store never rolls back; untested reverse SQL would be theater.
3. **Version stamp = `PRAGMA user_version`.** The store records the highest applied version there — no extra table. A fresh DB reports `user_version = 0`.
4. **Applied exactly once, in order.** On launch, `migrate()` applies every migration with `version > user_version` ascending; each runs **in a transaction** and, on success, sets `user_version = version`. A failure rolls back that migration and aborts the run (the store stays at the last good version).
5. **Idempotent.** Re-running with no pending migrations performs **zero** schema changes (SC-004).
6. **Lossless upgrade.** Applying pending migrations preserves all existing rows (SC-005). Migrations that reshape data must carry the data forward within the same transaction.
7. **Refuse newer-than-app.** If `user_version` exceeds the latest known migration version, `migrate()` throws a clear version-mismatch error and the app does not operate on the store (prevents an older build corrupting a store written by a newer one). (US3 AS-3.)
8. **Immutable once shipped.** A released migration's SQL is never edited — fixes/changes are a *new* migration. (Editing a shipped migration would diverge stores that already applied the old text.)

## Acceptance ↔ rule map

| Scenario | Rule(s) |
|---|---|
| Fresh DB → full schema created (US1 AS-1) | 1, 3, 4 |
| Older store upgrades, data intact (US3 AS-1) | 4, 6 |
| Current store → no changes (US3 AS-2 / SC-004) | 5 |
| Newer store refused (US3 AS-3 / SC-005) | 7 |
| Mid-migration failure leaves store consistent | 4 (transaction) |

## Test obligations (FR-011 / SC-008)

- Fresh apply: `user_version 0 → latest`, all tables exist.
- Idempotent: second `migrate()` reports `applied: 0`, no DDL ran.
- Version bump: with a dummy migration 2 registered, `1 → 2` applies only #2.
- Lossless: insert rows at v1, apply a v2 that adds a column, rows survive.
- Refuse-newer: set `user_version` beyond latest → `migrate()` throws.
