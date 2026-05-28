# Contract: Vault-Writes Repository (Feature 003 addition)

**Feature**: 005-vault-layer · **Date**: 2026-05-27

Additive to the Feature 003 data layer. **No schema change** — the `vault_writes` table and `VaultWriteSchema` shipped in 003; this adds typed CRUD over them, through the `SqlExecutor` seam. New file `src/db/repositories/vaultWrites.ts`, re-exported from `src/db/index.ts`.

## `recordVaultWrite`

```ts
export function recordVaultWrite(
  db: SqlExecutor,
  filePath: string,
  fingerprint: { mtime: string; hash: string },
): Promise<void>;
```

- Upserts on the natural key `file_path` (uses the 003 `upsert` helper with `["file_path"]`), writing `app_mtime` ← `mtime`, `app_hash` ← `hash`. Re-recording the same path updates in place (FR-008).

## `getVaultWrite`

```ts
export function getVaultWrite(db: SqlExecutor, filePath: string): Promise<VaultWrite | null>;
```

- Reads the recorded row parsed through `VaultWriteSchema`, or `null` if the path has no record (the "unmanaged" case the conflict state machine treats as a conflict).

## Test obligations (this feature)

- `recordVaultWrite` then `getVaultWrite` round-trips the fingerprint; re-recording the same `file_path` updates (no duplicate) — run against an in-memory `node:sqlite` executor (the 003 seam), `// @vitest-environment node`.

## Stability

Additive to the 003 public surface. The `VaultWriteLog` implementation in `src/vault` is the sole intended consumer for now.
