# Contract — Resource data layer changes (011)

## Migration `m0005_resource_domain` (`src/db/migrations/m0005_resource_domain.ts`)

```ts
export const m0005ResourceDomain: Migration = {
  version: 5,
  name: "resource_domain",
  sql: `
ALTER TABLE resources ADD COLUMN domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_resources_domain_id ON resources(domain_id);
`.trim(),
};
```

Registered in `src/db/migrations/index.ts`. Additive only → safe under the idempotent runner; latest version becomes **5**.

**`ON DELETE SET NULL`** (analyze C1): Domains are user-deletable (Feature 004) and FK enforcement is on, so a bare `REFERENCES domains(id)` (NO ACTION) would make deleting a Domain that has Resources filed under it **fail**. `SET NULL` instead *unfiles* those Resources (their `domain_id` → NULL) — consistent with "home Domain is optional" — and never deletes the Resource itself.

## Model (`src/db/models/resource.ts`)

```ts
export const ResourceSchema = z.object({
  // …existing…
  vault_id: z.string().nullable(),
  domain_id: z.string().nullable(),   // NEW
  // …title, kind, file_path, url, metadata, ingested_at, added_at…
});
```

## Repository (`src/db/repositories/resources.ts`)

```ts
// registerResource: add optional domainId
registerResource(db, vaultId, {
  title, kind, filePath?, url?, metadata?,
  domainId?: string | null,            // NEW → resources.domain_id
}): Promise<Resource>

// updateResource: add optional domainId to the patch
updateResource(db, id, {
  title?, kind?, filePath?, url?, metadata?,
  domainId?: string | null,            // NEW
}): Promise<Resource>

// listResources: optional domain filter (registry filtering, SC-007)
listResources(db, vaultId, opts?: { domainId?: string }): Promise<Resource[]>
//   base:           SELECT * FROM resources WHERE vault_id = ?
//   with domainId:  …AND domain_id = ?
//   ORDER BY title  (unchanged)
```

Behavioural contract:

| Call | Expectation |
|---|---|
| `registerResource(…, { domainId: D })` | row's `domain_id = D`; re-read returns `domain_id: D`. |
| `registerResource(…)` (no domainId) | `domain_id = null` (unfiled). |
| `updateResource(id, { domainId: D })` | reassigns; `updateResource(id, { domainId: null })` unfiles. |
| `updateResource(id, {})` | `domain_id` unchanged (patch semantics — only set keys present). |
| `listResources(v)` | all of vault `v`, any domain. |
| `listResources(v, { domainId: D })` | only `v`'s resources with `domain_id = D`. |
| existing rows (pre-m0005) | `domain_id = null`; unaffected (lossless). |
| delete a Domain that has Resources filed under it | the Domain delete **succeeds**; those Resources survive with `domain_id` set to NULL (unfiled) — `ON DELETE SET NULL` (C1). The Resource is never deleted by a Domain delete. |

`filePath` semantics are unchanged at the repo layer — it stores whatever absolute path it's given; this feature's hook sets it to the internalized path returned by `SourceFiles.importFile` (R3). `deleteResource` SQL is unchanged (FK cascade handles links); **file** cleanup is the hook calling `SourceFiles.removeFiles` (not a repo concern).

## Tests

- `migrate.srs.test.ts` and the version-pinned migration tests: bump latest 4 → 5; scope 010's self-heal/idempotent assertions accordingly (R9).
- `resources.test.ts`: register-with-domain, update-domain (set/clear), `listResources` domain filter, lossless (pre-m0005 row reads `domain_id: null`), and **domain-delete unfiles** (file a Resource under a Domain, delete the Domain → the delete succeeds and the Resource survives with `domain_id: null` — C1).
