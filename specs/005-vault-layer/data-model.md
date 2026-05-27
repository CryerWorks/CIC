# Data Model: Vault Layer

**Feature**: 005-vault-layer · **Date**: 2026-05-27

This feature adds **no SQLite tables** — the `vault_writes` table shipped in Feature 003. What it introduces are the **value shapes** the layer reads/returns and the **additive repository** over the existing table. Canonical content lives in the vault as Markdown (Constitution I); SQLite holds only the conflict-detection fingerprint.

## Value shapes (`src/vault`)

### `Fingerprint` — the conflict-detection primitive
```ts
interface Fingerprint { mtime: string; hash: string; } // ISO-8601 mtime + SHA-256 hex of file text
```
Computed from a file's stat + content (research R5). Compared on write; recorded after a successful write.

### `VaultNote<T>` — a parsed note
```ts
interface VaultNote<T> {
  path: string;        // vault-relative
  frontmatter: T;      // parsed + validated against the caller's zod schema
  body: string;        // the Markdown body (byte-faithful round-trip)
  raw: string;         // the full original file text
}
```

### `ReadResult` semantics
- `readNote(path)` → `{ data: Record<string, unknown>, body, raw }` (frontmatter parsed, not yet schema-checked).
- `readNoteAs(path, schema)` → `VaultNote<T>` on success, or a typed **parse failure** (FR-002) — never a throw that crashes a caller. A read may also carry an informational **drift** flag if the on-disk fingerprint differs from the recorded one (FR-010).

### `WriteResult` — the never-clobber outcome (FR-006/009)
```ts
type WriteResult =
  | { status: "written"; fingerprint: Fingerprint }
  | { status: "conflict"; reason: "drifted" | "unmanaged"; current: Fingerprint; recorded?: Fingerprint };
```
`writeNote(path, { frontmatter, body }, opts?)` returns `written` (and records the fingerprint) or `conflict` (and leaves the file untouched). `opts.overwrite` forces a write after resolution and still records.

### Error / rejection shapes (`errors.ts`)
- **Path rejected** (FR-011/012): a typed error from the pure validator, thrown/returned before any I/O.
- **Frontmatter parse failure** (FR-002): a typed result carrying the zod issue(s), surfaced (never a crash).

## Validation rules

- **Frontmatter**: parsed by gray-matter, then `schema.parse(data)` (caller-supplied). Failure → typed parse failure (FR-002). The vault layer ships a tiny base helper (`frontmatter must be an object`) but owns **no** note-type schemas.
- **Paths**: pure validation (research R6) — reject absolute, `..`/escaping, and `.obsidian/`; accept in-vault subfolder paths. Runs before every operation.
- **Fingerprint**: `mtime` from `VaultFs.stat`; `hash` = SHA-256 of the file text. Equality = both match.

## Persisted entity (Feature 003 — unchanged table)

**`vault_writes`** (PRD §13): `file_path TEXT PK · app_mtime TEXT NOT NULL · app_hash TEXT NOT NULL`. Model `VaultWriteSchema` already exists (003). **No migration.**

### Additive repository — `src/db/repositories/vaultWrites.ts`

| Function | Signature | Notes |
|---|---|---|
| `recordVaultWrite` | `(db, file_path, fingerprint: { mtime; hash }) => Promise<void>` | Upsert on the natural key `file_path` (uses the 003 `upsert` helper). Called after a successful write. |
| `getVaultWrite` | `(db, file_path) => Promise<VaultWrite \| null>` | Reads the recorded fingerprint (parsed via `VaultWriteSchema`), or null if unmanaged. |

Exported from `src/db/index.ts`. The `VaultWriteLog` interface (in `src/vault`) is implemented over these at the vault composition root (research R7).

## State transitions

- **Write decision** (the conflict state machine, research R5): `fresh | managed-unchanged → written`; `drifted | unmanaged → conflict`; `overwrite → written`. Always records the fingerprint on a successful write.
- No other stateful entities; the layer is otherwise stateless request→response over the filesystem.

## Not in this feature

No new tables/migration. No MOC body template or marker-section state, no diff-dialog state, no watcher/backlink index, no note-type schemas (Course/Project), no UI. Those build on these primitives later.
