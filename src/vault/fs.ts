/**
 * The `VaultFs` seam — the thin, low-level filesystem abstraction the whole vault layer is
 * built on (Constitution IV; research R3). Both adapters implement it identically:
 *   - `adapters/tauri.ts` — production, the ONLY importer of `@tauri-apps/plugin-fs`
 *   - `adapters/node.ts`  — tests, over `node:fs/promises` (never imported by app code)
 *
 * All methods take **absolute** paths. Resolution + path-safety happens one layer up, in the
 * reader/writer via `resolveVaultPath` (so callers above never construct absolute paths and the
 * security boundary lives in one pure, testable place — research R6). Keeping this interface
 * vendor-neutral is what makes atomicity, conflict detection, and path-scoping unit-testable
 * against a real filesystem without the Tauri runtime.
 */

export interface VaultStat {
  /** Last-modified time in epoch milliseconds. */
  mtimeMs: number;
}

export interface VaultDirent {
  name: string;
  isDirectory: boolean;
}

export interface VaultFs {
  readTextFile(absPath: string): Promise<string>;
  writeTextFile(absPath: string, contents: string): Promise<void>;
  rename(fromAbs: string, toAbs: string): Promise<void>;
  stat(absPath: string): Promise<VaultStat>;
  exists(absPath: string): Promise<boolean>;
  readDir(absPath: string): Promise<VaultDirent[]>;
  mkdir(absPath: string, opts?: { recursive?: boolean }): Promise<void>;
  /** Delete a file. Used by the atomic writer to clean up its own temp file on a failed write
   *  (best-effort) and by `deleteNote` to remove a managed note after the never-clobber check
   *  passes. Idempotent on a missing path. */
  remove(absPath: string): Promise<void>;
}
