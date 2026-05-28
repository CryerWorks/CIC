# Contract: Settings Repository (Feature 003 store, additive)

**Feature**: 006-vault-config · **Date**: 2026-05-28

A generic key-value app-state store over the `SqlExecutor` seam. New table via migration `m0002`; new repo `src/db/repositories/settings.ts`, re-exported from `src/db/index.ts`. The configured vault path is one key (`vault.path`); the table is reusable for future small settings.

## Migration — `src/db/migrations/m0002_settings.ts`

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
Appended to the registry in `src/db/migrations/index.ts` (forward-only; never reorder/edit a shipped migration).

## `getSetting`

```ts
export function getSetting(db: SqlExecutor, key: string): Promise<string | null>;
```
- Reads the row parsed through `SettingSchema`; returns its `value`, or `null` if the key is unset.

## `setSetting`

```ts
export function setSetting(db: SqlExecutor, key: string, value: string): Promise<void>;
```
- Upserts on the natural key `key` (003 `upsert` helper with `["key"]`). Re-setting overwrites in place.

## Test obligations (this feature)

- `m0002` applies on top of `m0001` and creates the `settings` table (migration evolution test, `// @vitest-environment node`).
- `setSetting` then `getSetting` round-trips a value; re-setting the same key updates in place (no duplicate); `getSetting` on an unset key → `null`. (in-memory `node:sqlite` executor.)

## Stability

Additive to the 003 public surface. `getSetting`/`setSetting` are generic; the `vault.path` key (constant `VAULT_PATH_KEY`) is owned by the vault-config feature.
