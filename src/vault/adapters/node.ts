import { readFile, writeFile, rename, stat, readdir, mkdir, rm } from "node:fs/promises";
import type { VaultFs, VaultStat, VaultDirent } from "../fs";

/**
 * Test-only `VaultFs` over `node:fs/promises` (research R3). The real filesystem in temp dirs —
 * real atomic `rename`, real mtimes, real directory semantics — so the atomicity (FR-004),
 * conflict (US2), and path-scoping (US3) behaviors are verified for real, not against a fake.
 * Never imported by app code; production uses `adapters/tauri.ts`.
 */
export class NodeVaultFs implements VaultFs {
  readTextFile(absPath: string): Promise<string> {
    return readFile(absPath, "utf8");
  }

  async writeTextFile(absPath: string, contents: string): Promise<void> {
    await writeFile(absPath, contents, "utf8");
  }

  async rename(fromAbs: string, toAbs: string): Promise<void> {
    await rename(fromAbs, toAbs);
  }

  async stat(absPath: string): Promise<VaultStat> {
    const s = await stat(absPath);
    return { mtimeMs: s.mtimeMs };
  }

  async exists(absPath: string): Promise<boolean> {
    try {
      await stat(absPath);
      return true;
    } catch {
      return false;
    }
  }

  async readDir(absPath: string): Promise<VaultDirent[]> {
    const entries = await readdir(absPath, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
  }

  async mkdir(absPath: string, opts?: { recursive?: boolean }): Promise<void> {
    await mkdir(absPath, { recursive: opts?.recursive ?? false });
  }

  async remove(absPath: string): Promise<void> {
    await rm(absPath, { force: true });
  }
}
