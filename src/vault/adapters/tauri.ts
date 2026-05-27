import {
  readTextFile,
  writeTextFile,
  rename,
  stat,
  exists,
  readDir,
  mkdir,
  remove,
} from "@tauri-apps/plugin-fs";
import type { VaultFs, VaultStat, VaultDirent } from "../fs";

/**
 * Production `VaultFs` over `@tauri-apps/plugin-fs`. This is the ONLY file in the app permitted
 * to import that plugin (enforced by the ESLint `no-restricted-imports` rule — the same
 * mechanism that confines the SQL plugin to `src/db/adapters/*`). Everything else depends on the
 * `VaultFs` seam.
 *
 * Not unit-tested — it needs the Tauri runtime; it is exercised by the consuming feature's
 * `tauri dev` (quickstart runtime check). The vault folder's path scope is granted at runtime
 * when the vault is configured (research R1), not via a static capability entry.
 */
export class TauriVaultFs implements VaultFs {
  readTextFile(absPath: string): Promise<string> {
    return readTextFile(absPath);
  }

  writeTextFile(absPath: string, contents: string): Promise<void> {
    return writeTextFile(absPath, contents);
  }

  rename(fromAbs: string, toAbs: string): Promise<void> {
    return rename(fromAbs, toAbs);
  }

  async stat(absPath: string): Promise<VaultStat> {
    const s = await stat(absPath);
    // `mtime` may be null on platforms that don't report it; fall back to 0 (treated as
    // "unknown" — the hash, not the mtime, decides content identity in fingerprint.ts).
    return { mtimeMs: s.mtime ? s.mtime.getTime() : 0 };
  }

  exists(absPath: string): Promise<boolean> {
    return exists(absPath);
  }

  async readDir(absPath: string): Promise<VaultDirent[]> {
    const entries = await readDir(absPath);
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
  }

  async mkdir(absPath: string, opts?: { recursive?: boolean }): Promise<void> {
    await mkdir(absPath, { recursive: opts?.recursive ?? false });
  }

  async remove(absPath: string): Promise<void> {
    await remove(absPath);
  }
}
