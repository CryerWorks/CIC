/**
 * `VaultIdentity` — the sanctioned owner of the per-vault identity marker (Feature 009, Constitution
 * I watch-item). It establishes/reads a stable vault id stored in a hidden, CIC-owned marker at
 * `.cic/vault.json` **inside** the vault. Distinct from `VaultWriter` (which is `.md`-note-shaped and
 * runs the never-clobber drift log): the marker is hidden non-note metadata, so it gets its own
 * thin capability — but it still lives in the vault layer and writes through the same atomic
 * temp→rename `VaultFs` primitive, so no app/db code ever touches the vault filesystem directly.
 *
 * Guarantees: written atomically (a reader never sees a half-written marker); never overwrites an
 * existing id (read-first; `ensure` only creates when absent); never a `.md` and lives under the
 * Obsidian-ignored `.cic/` dot-folder, so it never surfaces as a Note/Course (FR-009).
 */

import { z } from "zod";
import type { VaultFs } from "./fs";
import { resolveVaultPath } from "./paths";

/** Relative location of the marker — a dot-folder Obsidian ignores; never `.md`. */
export const VAULT_MARKER_PATH = ".cic/vault.json";

const MarkerSchema = z.object({
  cicVaultMarker: z.literal(1),
  id: z.string().min(1), // an opaque stable id (minted as a UUID, but not constrained to that form)
});

export interface VaultIdentity {
  /** Read + parse the marker. `null` if absent or unparseable (caller recreates). Never writes. */
  read(): Promise<string | null>;
  /** Read; if present return it (`created:false`); else mint a UUID, write it atomically, and
   *  return `{ id, created:true }`. Idempotent. */
  ensure(): Promise<{ id: string; created: boolean }>;
  /** (Re)write a known id atomically — recovery when the marker was lost (FR-010). */
  write(id: string): Promise<void>;
}

export function createVaultIdentity(fs: VaultFs, vaultPath: string): VaultIdentity {
  const abs = resolveVaultPath(vaultPath, VAULT_MARKER_PATH);

  async function read(): Promise<string | null> {
    if (!(await fs.exists(abs))) return null;
    try {
      const parsed = MarkerSchema.parse(JSON.parse(await fs.readTextFile(abs)));
      return parsed.id;
    } catch {
      return null; // malformed/non-conforming → treat as absent
    }
  }

  async function write(id: string): Promise<void> {
    const contents = `${JSON.stringify({ cicVaultMarker: 1, id }, null, 2)}\n`;
    const sep = abs.lastIndexOf("/");
    if (sep > 0) await fs.mkdir(abs.slice(0, sep), { recursive: true });
    const tmp = `${abs}.${crypto.randomUUID()}.cic-tmp`;
    try {
      await fs.writeTextFile(tmp, contents);
      await fs.rename(tmp, abs);
    } catch (err) {
      await fs.remove(tmp).catch(() => {}); // best-effort cleanup; never mask the real error
      throw err;
    }
  }

  async function ensure(): Promise<{ id: string; created: boolean }> {
    const existing = await read();
    if (existing) return { id: existing, created: false };
    const id = crypto.randomUUID();
    await write(id);
    return { id, created: true };
  }

  return { read, ensure, write };
}
