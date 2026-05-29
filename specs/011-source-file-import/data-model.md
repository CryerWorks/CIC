# Data Model — Source File Import & Local Storage (011)

Two stores are involved: the **SQLite** `resources` row (gains one column) and a new **filesystem** store for the copied bytes (not a database — described here for completeness).

---

## SQLite: `resources` (existing table, one additive column)

Migration **`m0005_resource_domain`** (additive only; safe under the idempotent runner — Feature 010 `fix(db)`):

```sql
ALTER TABLE resources ADD COLUMN domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_resources_domain_id ON resources(domain_id);
```

Resulting `resources` columns (← = added by an earlier feature):

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `vault_id` | TEXT NULL → `vaults(id)` | ← m0004 (010). Registry scope. |
| `domain_id` | TEXT NULL → `domains(id)` **ON DELETE SET NULL** | **NEW (m0005).** Optional "home Domain" for filing/filtering (FR-012). NULL = unfiled. Deleting the Domain unfiles its Resources (C1). |
| `title` | TEXT NOT NULL | |
| `kind` | TEXT NOT NULL CHECK(kind IN …) | pdf · epub · markdown · video_file · video_url · web_page · book · audio |
| `file_path` | TEXT NULL | **For file-kinds, now holds the internalized absolute path** (R3). For URL-kinds, unused. |
| `url` | TEXT NULL | URL-kinds (web_page, video_url). |
| `metadata` | TEXT NOT NULL DEFAULT '{}' | per-kind JSON (010). |
| `ingested_at` | TEXT NULL | reserved for the future RAG feature; this feature never sets it. |
| `added_at` | TEXT NOT NULL | |

**Why nullable `domain_id` (not NOT NULL)**: existing rows back-fill NULL; a Resource may be deliberately unfiled. **`ON DELETE SET NULL`** (analyze C1): Domains are user-deletable (Feature 004) with FK enforcement on, so a NO-ACTION FK would make a Domain delete **fail** whenever a Resource is filed under it. `SET NULL` unfiles those Resources instead (the Domain delete succeeds, the Resources survive). The index supports the registry filter.

### Zod model (`src/db/models/resource.ts`)

Add one field (mirrors the existing nullable `vault_id`):

```ts
domain_id: z.string().nullable(),
```

Decoded shape: `Resource.domain_id: string | null`. `file_path` stays `string | null` (now an internalized path for file-kinds).

### Validation rules (from requirements)

- `file_path` for a file-kind Resource, when set, is an absolute path **inside the app store** (`appLocalData/resources/<id>/…`) — enforced by the import command, not the DB.
- A Resource references **at most one** stored file (FR-005) — re-import replaces.
- URL-kinds never set `file_path` (FR-006).

---

## Filesystem: the app source-file store (new; not a DB)

```
<app_local_data_dir>/
└── resources/
    └── <resourceId>/
        └── <originalFilename.ext>     # the internalized copy
```

| Property | Value |
|---|---|
| Root | OS app-local-data dir (per-machine, not the vault, not synced) |
| Key | `resourceId` (one folder per Resource) |
| Contents | exactly one file per Resource (file-kinds only) |
| Lifecycle | created on import; folder cleared+rewritten on re-import (R8); folder removed on Resource delete (R4) |
| Invariant | the path **never** resolves inside `vaultPath` (Constitution I); destination is computed server-side (R11) |

**Relationship to `resources.file_path`**: `file_path` = the absolute path of the single file in `resources/<id>/`. Cleanup operates on the **folder** (`resourceId`), independent of `file_path`'s current value.

---

## State / transitions (a file-kind Resource's stored file)

```
(no file)  ──pick file──▶  importFile()  ──ok──▶  (stored: file_path set, copy in store)
                                         └─fail─▶  (no file)        # all-or-nothing, FR-011/SC-002

(stored)   ──pick new──▶   importFile()  ──ok──▶  (stored: replaced)   # R8
(stored)   ──delete Resource──▶  removeFiles()  ──▶  (folder gone)     # R4; row already cascade-deleted
(any)      ──store file missing externally──▶  open disabled, locator shown   # FR-008, graceful
```

---

## Affected repositories (`src/db/repositories/resources.ts`)

| Function | Change |
|---|---|
| `registerResource(db, vaultId, input)` | `input` gains optional `domainId?: string \| null` → written to `domain_id`. |
| `updateResource(db, id, patch)` | `patch` gains optional `domainId?: string \| null`. |
| `listResources(db, vaultId, opts?)` | optional `{ domainId?: string }` filter → `AND domain_id = ?` when provided (registry Domain filter, SC-007). |
| (existing) `deleteResource` | unchanged in SQL (cascade handles links); the *file* cleanup is the hook's `removeFiles` call, not here. |

No change to `card_resources` / `course_resources` / `listResourceCourseLinks`.
