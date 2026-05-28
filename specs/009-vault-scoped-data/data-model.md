# Data Model: Vault-scoped data

Additive changes to the 003 schema (PRD §8) + one hidden in-vault marker file. No table rebuild, no destructive change (research R3).

## New table: `vaults`

The CIC-tracked identity of a connected Obsidian vault. One row per vault CIC has ever established identity for; exactly one is *active* at runtime (held in `VaultProvider`, not the DB).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PRIMARY KEY | The stable UUID from the in-vault marker (`.cic/vault.json`). Survives folder rename/move (FR-001). |
| `path` | TEXT NOT NULL | Last-connected absolute folder path. **Refreshed on every connect** so the missing-marker recovery (R7) and any path display stay current. |
| `created_at` | TEXT NOT NULL | ISO timestamp, set on first insert. |

```sql
CREATE TABLE IF NOT EXISTS vaults (
  id         TEXT PRIMARY KEY,
  path       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

**zod** (`src/db/models/vault.ts`):

```ts
export const VaultRecordSchema = z.object({
  id: z.string(),
  path: z.string(),
  created_at: z.string(),
});
export type VaultRecord = z.infer<typeof VaultRecordSchema>;
```

> Note the name distinction: `VaultRecord` (this DB row) is **not** the 005 runtime `Vault` handle (`{ reader, writer, identity }`). The repo type is suffixed `Record` to avoid collision.

## Changed table: `domains`

Gains a nullable vault link — the **single scope anchor**. Campaigns/Courses/Milestones inherit their vault transitively (they cascade under Domains), so no vault column is added below Domain (spec assumption; research R3).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | unchanged |
| `name` | TEXT NOT NULL **UNIQUE** | unchanged — **retained global uniqueness** (research R8; per-vault names deferred) |
| `color` | TEXT NOT NULL | unchanged |
| `vault_id` | TEXT, nullable, `REFERENCES vaults(id)` | **NEW.** NULL for pre-feature rows until adopted (R6). Indexed. |

```sql
ALTER TABLE domains ADD COLUMN vault_id TEXT REFERENCES vaults(id);
CREATE INDEX IF NOT EXISTS idx_domains_vault_id ON domains(vault_id);
```

`DomainSchema` gains `vault_id: z.string().nullable()` (nullable so a freshly-migrated, not-yet-adopted row still parses; in practice every row a scoped read returns has a non-null `vault_id`).

### Why nullable + no `ON DELETE CASCADE` requirement

- **Nullable**: `ALTER TABLE ADD COLUMN` back-fills existing rows with NULL; the runtime adoption step (below) assigns them. A non-null default is impossible (the value is the runtime marker id).
- **No cascade needed in scope**: this feature never deletes a `vaults` row (vault removal is out of scope). The `REFERENCES` is declared for integrity; cascade-on-vault-delete is a future concern.

## Migration `m0003_vaults`

Appended to the forward-only runner (`migrations/index.ts`), `version: 3`. Three statements, all additive and idempotent (`IF NOT EXISTS` / nullable add) — safe under the FK-on, transaction-wrapped runner and the pooled production adapter (research R3). Immutable once shipped.

## The identity marker (in the vault, not SQLite)

`.cic/vault.json` — hidden CIC-owned file (research R1/R2). **Not** a `.md` note; never in `reader.list()`; ignored by Obsidian.

```json
{ "cicVaultMarker": 1, "id": "<uuid-v4>" }
```

zod (`src/vault/identity.ts`): `{ cicVaultMarker: z.literal(1), id: z.string().uuid() }`. A parse failure ⇒ treat as absent (recreate via recovery).

## Scoping invariant

> **A row's owning vault = its Domain's `vault_id`.** Campaign(`domain_id`)→vault, Course(`domain_id`)→vault, Milestone(`course_id`→`courses.domain_id`)→vault. The active-vault filter therefore lives on Domain reads (`WHERE domains.vault_id = ?`) and a Course read joins to Domain.

Scoped queries:

- **Domains list**: `SELECT * FROM domains WHERE vault_id = ? ORDER BY name`.
- **Courses list** (Courses screen + Dashboard groups): `SELECT c.* FROM courses c JOIN domains d ON d.id = c.domain_id WHERE d.vault_id = ? ORDER BY c.title`.
- **Dashboard totals**: each subquery scoped, e.g. `(SELECT COUNT(*) FROM domains WHERE vault_id = ?)`, courses/milestones via `JOIN domains d … WHERE d.vault_id = ?`.
- **Dashboard milestone status**: `… FROM milestones m JOIN courses c ON c.id=m.course_id JOIN domains d ON d.id=c.domain_id WHERE d.vault_id = ? GROUP BY m.status`.
- **Dashboard allocation**: the existing `LEFT JOIN` query + `WHERE d.vault_id = ?` (zero-course Domains of the active vault still included).

## Runtime adoption (FR-008)

`attachVault(db, { id, path })` (`repositories/vaults.ts`):

```text
upsert vaults(id, path=:path, created_at=now on insert)   -- path always refreshed
if EXISTS(SELECT 1 FROM domains WHERE vault_id IS NULL):
    UPDATE domains SET vault_id = :id WHERE vault_id IS NULL   -- one-shot legacy adoption
```

Self-limiting: only the first vault to attach finds NULL domains; subsequent vaults adopt nothing (research R6).

## State / lifecycle

- **Vault identity**: `absent → established` (marker created on first connect) → stable thereafter. Recovery re-creates the marker from the path-matched `vaults` row (R7).
- **Domain.vault_id**: `NULL (pre-feature) → assigned (adopted on first attach, or set at create-time for new domains)`. Never returns to NULL in normal flow.
- **Active vault** (runtime, `VaultProvider`): `checking → unset | ready{id,path,vault} | unavailable`. The `id` is the new field (research R5).
