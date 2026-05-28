/**
 * `VaultWriter` — the ONE module that writes `.md` (Constitution I / FR-015). Two guarantees:
 *
 *  1. **Atomic** (FR-004): serialize → write a temp file in the *same* directory → `rename` over
 *     the target. Rename is atomic on one filesystem, so a reader never sees a half-written note
 *     and a successful write leaves no temp artifact. (Temp-in-same-dir, not the OS tmp dir, so
 *     the rename can't become a cross-device copy — research R4.)
 *  2. **Never clobber** (FR-005/006/009): before writing, compare the on-disk fingerprint against
 *     the one the app last recorded (`VaultWriteLog`). On drift or an unmanaged file, refuse and
 *     return a typed conflict, leaving the file untouched. `overwrite` bypasses the check after a
 *     conflict has been resolved — but still records the new fingerprint (research R5).
 */

import type { VaultFs } from "./fs";
import type { VaultWriteLog } from "./writeLog";
import type { WriteResult, DeleteResult, Fingerprint } from "./errors";
import { resolveVaultPath } from "./paths";
import { serializeNote } from "./frontmatter";
import { computeFingerprint, contentChanged } from "./fingerprint";

export interface NoteInput {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface WriteOptions {
  /** Write despite a detected conflict (use only after the conflict is resolved, FR-007). */
  overwrite?: boolean;
}

export interface DeleteOptions {
  /** Delete despite a detected conflict (use only after explicit, confirmed user intent). */
  overwrite?: boolean;
}

/** A never-clobber conflict (the shared shape of a refused write/delete). */
type Conflict = Extract<WriteResult, { status: "conflict" }>;

export class VaultWriter {
  constructor(
    private readonly fs: VaultFs,
    private readonly vaultPath: string,
    private readonly log: VaultWriteLog,
  ) {}

  async writeNote(relPath: string, note: NoteInput, opts: WriteOptions = {}): Promise<WriteResult> {
    const abs = resolveVaultPath(this.vaultPath, relPath);
    const contents = serializeNote(note.frontmatter, note.body);

    if (!opts.overwrite) {
      const conflict = await this.checkConflict(relPath, abs);
      if (conflict) return conflict;
    }

    await this.ensureParentDir(abs);
    await this.atomicWrite(abs, contents);

    const fingerprint = await this.fingerprintOnDisk(abs);
    await this.log.record(relPath, fingerprint);
    return { status: "written", fingerprint };
  }

  /** Delete a managed note under the same never-clobber guard as `writeNote` (Feature 007). An
   *  absent path is a no-op (`absent`); a drifted or unmanaged file is refused (`conflict`) and
   *  left untouched unless `overwrite` is set after explicit user confirmation. On success the
   *  file is removed and its fingerprint forgotten, so the path reverts to "unmanaged". This is
   *  the ONLY sanctioned path that deletes a user note — routed here so it can't bypass the guard. */
  async deleteNote(relPath: string, opts: DeleteOptions = {}): Promise<DeleteResult> {
    const abs = resolveVaultPath(this.vaultPath, relPath);

    if (!(await this.fs.exists(abs))) {
      await this.log.forget(relPath); // clear any stale record for an already-gone file
      return { status: "absent" };
    }

    if (!opts.overwrite) {
      const conflict = await this.checkConflict(relPath, abs);
      if (conflict) return conflict;
    }

    await this.fs.remove(abs);
    await this.log.forget(relPath);
    return { status: "deleted" };
  }

  /** The never-clobber state machine (research R5). Returns a conflict result to abort the write,
   *  or `null` to proceed. A file present on disk that the app never recorded is `unmanaged`; a
   *  recorded file whose content changed externally is `drifted`. A file the app recorded but is
   *  now absent (deleted externally) is treated as a fresh write — recreating loses nothing. */
  private async checkConflict(relPath: string, abs: string): Promise<Conflict | null> {
    if (!(await this.fs.exists(abs))) return null; // fresh (or externally deleted) → write

    const currentText = await this.fs.readTextFile(abs);
    const current = await computeFingerprint(this.fs, abs, currentText);
    const recorded = await this.log.get(relPath);

    if (!recorded) {
      return { status: "conflict", reason: "unmanaged", current };
    }
    if (contentChanged(recorded, current)) {
      return { status: "conflict", reason: "drifted", current, recorded };
    }
    return null; // managed + unchanged → safe to overwrite
  }

  private async ensureParentDir(abs: string): Promise<void> {
    const sep = abs.lastIndexOf("/");
    if (sep > 0) {
      await this.fs.mkdir(abs.slice(0, sep), { recursive: true });
    }
  }

  private async atomicWrite(abs: string, contents: string): Promise<void> {
    const tmp = `${abs}.${crypto.randomUUID()}.cic-tmp`;
    try {
      await this.fs.writeTextFile(tmp, contents);
      await this.fs.rename(tmp, abs);
    } catch (err) {
      await this.fs.remove(tmp).catch(() => {}); // best-effort cleanup; never mask the real error
      throw err;
    }
  }

  /** Fingerprint from the freshly-written file (mtime from the renamed file + hash of its text).
   *  Reading back rather than trusting `contents` keeps the recorded mtime exactly what's on disk. */
  private async fingerprintOnDisk(abs: string): Promise<Fingerprint> {
    const text = await this.fs.readTextFile(abs);
    return computeFingerprint(this.fs, abs, text);
  }
}
