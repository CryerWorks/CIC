# Contract: `src/vault` Public Interface

**Feature**: 005-vault-layer · **Date**: 2026-05-27

The knowledge-persistence spine's public surface. Features (course authoring, notes, sync, …) depend on **this** — never on `@tauri-apps/plugin-fs`, raw `fs`, or `src/db` internals. Constitution I + IV: a single safe writer; thin interfaces, deep adapters.

## `VaultFs` (the seam) — `src/vault/fs.ts`

The low-level filesystem abstraction every higher layer is built on. Both adapters implement it identically.

```ts
export interface VaultStat { mtimeMs: number; }
export interface VaultDirent { name: string; isDirectory: boolean; }

export interface VaultFs {
  readTextFile(absPath: string): Promise<string>;
  writeTextFile(absPath: string, contents: string): Promise<void>;
  rename(fromAbs: string, toAbs: string): Promise<void>;
  stat(absPath: string): Promise<VaultStat>;
  exists(absPath: string): Promise<boolean>;
  readDir(absPath: string): Promise<VaultDirent[]>;
  mkdir(absPath: string, opts?: { recursive?: boolean }): Promise<void>;
}
```

- Adapters resolve **validated, `vaultPath`-relative** paths to absolute internally; callers above never pass absolute paths.
- **Adapters** (deep): `adapters/tauri.ts` (production — the *only* importer of `@tauri-apps/plugin-fs`), `adapters/node.ts` (tests — `node:fs/promises`). App code never imports the node adapter.

## Path safety — `src/vault/paths.ts` (pure, no I/O)

```ts
/** Validate + normalize a vault-relative path; throws VaultPathError on escape/absolute/.obsidian. */
export function resolveVaultPath(vaultPath: string, relPath: string): string; // → absolute, guaranteed inside vaultPath
```

Rejects absolute paths, `..`/escaping paths, and anything under `.obsidian/` **before** any filesystem access (FR-011/012).

## `VaultReader` — `src/vault/reader.ts`

```ts
export interface VaultReader {
  exists(relPath: string): Promise<boolean>;
  list(relDir?: string): Promise<string[]>;                       // vault-relative .md paths
  readNote(relPath: string): Promise<{ data: Record<string, unknown>; body: string; raw: string }>;
  readNoteAs<T>(relPath: string, schema: ZodType<T>): Promise<ReadOutcome<T>>;
}
```

- `readNoteAs` validates frontmatter via the caller's schema; on failure returns a typed parse failure (never throws to a crash — FR-002). May include an informational `drift` signal (FR-010).

## `VaultWriter` — `src/vault/writer.ts` (the ONLY `.md` writer)

```ts
export interface VaultWriter {
  writeNote(
    relPath: string,
    note: { frontmatter: Record<string, unknown>; body: string },
    opts?: { overwrite?: boolean },
  ): Promise<WriteResult>;
}

export type WriteResult =
  | { status: "written"; fingerprint: Fingerprint }
  | { status: "conflict"; reason: "drifted" | "unmanaged"; current: Fingerprint; recorded?: Fingerprint };
```

- **Atomic** (temp-in-same-dir → rename; FR-004). Serializes clean Markdown (FR-003).
- **Never clobbers** (FR-006/009): runs the conflict state machine (research R5) against the `VaultWriteLog`; on `written`, records the new fingerprint. `overwrite` bypasses the check post-resolution but still records.

## `VaultWriteLog` — `src/vault/writeLog.ts`

```ts
export interface VaultWriteLog {
  get(relPath: string): Promise<Fingerprint | null>;
  record(relPath: string, fingerprint: Fingerprint): Promise<void>;
}
```

Keeps `VaultWriter` independent of `src/db` (research R7). Implemented over the 003 `vault_writes` repo at the composition root; tests inject an in-memory implementation.

## Composition root — `src/vault/bootstrap.ts`

```ts
/** Build the production vault layer for a configured vault folder. Wires the Tauri VaultFs and a
 *  VaultWriteLog backed by the 003 vault_writes repo (given the SqlExecutor). */
export function createVault(opts: { vaultPath: string; db: SqlExecutor }): { reader: VaultReader; writer: VaultWriter };
```

The one place that imports both the Tauri fs adapter and `src/db`. Features receive a `reader`/`writer`, never construct adapters.

## Public barrel — `src/vault/index.ts`

Re-exports the interfaces (`VaultReader`, `VaultWriter`, `VaultFs`, `VaultWriteLog`), the result/error types (`WriteResult`, `Fingerprint`, parse/path failures), and `createVault`. Not the node adapter (test-only).

## Stability

The interface shapes, `WriteResult`, the conflict semantics (never-clobber default), and the path-safety guarantee are a **public contract** for consuming features. Adding a method is additive; changing a signature or the never-clobber default is breaking.
