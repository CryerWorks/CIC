# Contract: DB migration + scoped repositories + adoption

The SQLite-layer changes: the additive migration, the new `vaults` repo (attach/adoption), and the vault-id parameters added to existing repo functions. All over the `SqlExecutor` seam; tested with `node:sqlite` (FK-on).

## Migration `m0003_vaults`

```ts
export const m0003Vaults: Migration = {
  version: 3,
  name: "vaults",
  sql: `
CREATE TABLE IF NOT EXISTS vaults (
  id         TEXT PRIMARY KEY,
  path       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
ALTER TABLE domains ADD COLUMN vault_id TEXT REFERENCES vaults(id);
CREATE INDEX IF NOT EXISTS idx_domains_vault_id ON domains(vault_id);
`.trim(),
};
```

Registered (append-only) in `migrations/index.ts`.

### Obligations

1. **Forward migrate from v2** applies `m0003` (result `{from:2,to:3,applied:1}`); `vaults` exists, `domains.vault_id` exists (default NULL), index exists.
2. **Lossless**: domains/courses/milestones rows inserted before `m0003` survive with `vault_id` NULL (mirrors `migrate.lossless.test.ts`).
3. **Idempotent**: re-running `migrate` at v3 is a no-op (`applied:0`).
4. The migration **does not** delete or rewrite any existing row (no rebuild — research R3).

## `repositories/vaults.ts` (NEW)

```ts
attachVault(db, { id, path }): Promise<void>   // upsert row (refresh path) + one-shot orphan adoption
getVaultByPath(db, path): Promise<VaultRecord | null>
getVault(db, id): Promise<VaultRecord | null>
```

`attachVault` (research R6):

```text
upsert vaults (id PK) → on insert set created_at=now & path; on conflict update path  (path always current)
if (any domains.vault_id IS NULL): UPDATE domains SET vault_id = id WHERE vault_id IS NULL
```

### Obligations

5. **attachVault inserts** a new row with the given path + a `created_at`; **re-attach** of the same id updates `path` only (created_at unchanged, no duplicate).
6. **First attach adopts orphans**: with pre-existing `vault_id IS NULL` domains, after `attachVault(A)` all those domains have `vault_id = A`.
7. **Second attach adopts nothing**: after A adopted the legacy set, `attachVault(B)` leaves B with zero domains (no NULLs remain) — no cross-vault bleed.
8. **getVaultByPath** returns the row whose `path` matches exactly, else null (recovery lookup).

## Scoped existing repositories

| Function | New signature | Query change |
|---|---|---|
| `createDomain` | `(db, vaultId, { name, color })` | row includes `vault_id: vaultId` |
| `listDomains` | `(db, vaultId)` | `WHERE vault_id = ? ORDER BY name` |
| `findOrCreateDomainByName` | `(db, vaultId, name)` | lookup within `listDomains(db,vaultId)`; create with `vaultId` |
| `listCourses` | `(db, vaultId)` | `JOIN domains d ON d.id=c.domain_id WHERE d.vault_id = ? ORDER BY c.title` |
| `getDashboardSummary` | `(db, vaultId)` | every aggregate scoped to the vault's domains (see data-model) |

Unchanged: `getDomain`, `updateDomain`, `deleteDomain`, `createCourse`, `getCourse`, `listCoursesByDomain`, `updateCourse`, `deleteCourse`, `getCourseByMocPath`, `upsertCourseRow`, all `campaigns`/`milestones` fns (scope inherited via Domain).

### Obligations

9. `createDomain(db, A, …)` then `listDomains(db, A)` returns it; `listDomains(db, B)` does **not** (FR-003/004/005).
10. A Course created under an A-domain appears in `listCourses(db, A)` and not `listCourses(db, B)`.
11. `getDashboardSummary(db, A)` counts only A's domains/courses/milestones; allocation lists only A's domains (incl. zero-course ones); `getDashboardSummary(db, B)` is independent.
12. `findOrCreateDomainByName(db, A, "Math")` reuses an A-domain named "Math" if present, else creates it under A — so the 007 rescan imports into the active vault.
13. **Round-trip isolation**: create distinct data under A and B; each scoped read sees only its own; switching the `vaultId` argument flips the result set losslessly (US1 / SC-001).

> **R8 caveat (documented, not a bug):** `createDomain` still hits the global `domains.name` UNIQUE, so the same name in two vaults is rejected at the DB. App-layer validation surfaces the existing "already exists" message. Per-vault names deferred (research R8).
