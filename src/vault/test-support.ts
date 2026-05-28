/**
 * Test-only helpers for the vault suite. Builds a real vault on a temp directory via the
 * `node:fs` adapter (`NodeVaultFs`) + an in-memory `VaultWriteLog`, so the reader/writer are
 * exercised against a genuine filesystem without the Tauri runtime (research R3). Never imported
 * by app code. Tests that use this must run under `// @vitest-environment node`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "./adapters/node";
import { VaultReader } from "./reader";
import { VaultWriter } from "./writer";
import type { VaultWriteLog } from "./writeLog";
import type { Fingerprint } from "./errors";

/** Trivial in-memory write log — the conflict-detection record without a database. */
export class InMemoryWriteLog implements VaultWriteLog {
  private readonly map = new Map<string, Fingerprint>();

  async get(relPath: string): Promise<Fingerprint | null> {
    return this.map.get(relPath) ?? null;
  }

  async record(relPath: string, fingerprint: Fingerprint): Promise<void> {
    this.map.set(relPath, fingerprint);
  }

  async forget(relPath: string): Promise<void> {
    this.map.delete(relPath);
  }
}

export interface TempVault {
  vaultPath: string;
  fs: NodeVaultFs;
  log: InMemoryWriteLog;
  reader: VaultReader;
  writer: VaultWriter;
  cleanup(): void;
}

/** Create an isolated temp vault wired with the node adapter + an in-memory write log. */
export function makeTempVault(): TempVault {
  const vaultPath = mkdtempSync(join(tmpdir(), "cic-vault-"));
  const fs = new NodeVaultFs();
  const log = new InMemoryWriteLog();
  return {
    vaultPath,
    fs,
    log,
    reader: new VaultReader(fs, vaultPath, log),
    writer: new VaultWriter(fs, vaultPath, log),
    cleanup: () => rmSync(vaultPath, { recursive: true, force: true }),
  };
}
