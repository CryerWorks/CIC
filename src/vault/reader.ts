/**
 * `VaultReader` — read notes, validate frontmatter against a caller schema, list, and existence
 * checks. Resolves every path through `resolveVaultPath` (the security boundary, FR-011/012)
 * before any I/O. Never crashes on a malformed note: `readNoteAs` returns a typed `ReadOutcome`
 * (FR-002) and surfaces external drift as informational, non-blocking (FR-010).
 */

import type { ZodType } from "zod";
import type { VaultFs, VaultDirent } from "./fs";
import type { VaultWriteLog } from "./writeLog";
import { type ReadOutcome, type VaultNote, FrontmatterParseError } from "./errors";
import { resolveVaultPath, joinRelative } from "./paths";
import { parseNote, validateFrontmatter, type ParsedNote } from "./frontmatter";
import { computeFingerprint, contentChanged } from "./fingerprint";

const OBSIDIAN_DIR = ".obsidian";

export interface RawNote {
  data: Record<string, unknown>;
  body: string;
  raw: string;
}

export class VaultReader {
  /**
   * @param log Optional. When provided, reads report informational `drift` (FR-010) by
   *   comparing the on-disk fingerprint against the recorded one. Omitted in the round-trip MVP
   *   (US1); wired at the composition root (US2).
   */
  constructor(
    private readonly fs: VaultFs,
    private readonly vaultPath: string,
    private readonly log?: VaultWriteLog,
  ) {}

  async exists(relPath: string): Promise<boolean> {
    return this.fs.exists(resolveVaultPath(this.vaultPath, relPath));
  }

  /** Read a note into its frontmatter `data`, `body`, and `raw` text (FR-001). Throws
   *  `FrontmatterParseError` only on unparseable YAML; prefer `readNoteAs` for the safe path. */
  async readNote(relPath: string): Promise<RawNote> {
    const abs = resolveVaultPath(this.vaultPath, relPath);
    const raw = await this.fs.readTextFile(abs);
    const { data, body } = parseNote(relPath, raw);
    return { data, body, raw };
  }

  /** Read + validate frontmatter against `schema` (FR-002). Returns a typed outcome — never a
   *  crash. The current content is returned regardless of drift (FR-010). */
  async readNoteAs<T>(relPath: string, schema: ZodType<T>): Promise<ReadOutcome<T>> {
    const abs = resolveVaultPath(this.vaultPath, relPath);

    let raw: string;
    try {
      raw = await this.fs.readTextFile(abs);
    } catch (err) {
      return {
        ok: false,
        error: new FrontmatterParseError(relPath, `Cannot read note ${relPath}: ${(err as Error).message}`),
        drift: false,
      };
    }

    const drift = await this.detectDrift(relPath, abs, raw);

    let parsed: ParsedNote;
    try {
      parsed = parseNote(relPath, raw);
    } catch (err) {
      return { ok: false, error: err as FrontmatterParseError, drift };
    }

    const validated = validateFrontmatter(relPath, parsed.data, schema);
    if (!validated.ok) return { ok: false, error: validated.error, drift };

    const note: VaultNote<T> = {
      path: relPath,
      frontmatter: validated.value,
      body: parsed.body,
      raw,
    };
    return { ok: true, note, drift };
  }

  /** List vault-relative `.md` paths under `relDir` (default: the whole vault), recursing into
   *  subfolders and never descending into `.obsidian/` (FR-013/012). */
  async list(relDir = ""): Promise<string[]> {
    const startAbs = resolveVaultPath(this.vaultPath, relDir);
    const out: string[] = [];
    await this.walk(relDir.replace(/[/\\]+$/, ""), startAbs, out);
    return out.sort();
  }

  private async walk(relPrefix: string, absDir: string, out: string[]): Promise<void> {
    let entries: VaultDirent[];
    try {
      entries = await this.fs.readDir(absDir);
    } catch {
      return; // a missing directory simply contributes nothing
    }
    for (const entry of entries) {
      if (entry.name === OBSIDIAN_DIR) continue; // FR-012 — never touch Obsidian config
      const childRel = joinRelative(relPrefix, entry.name);
      if (entry.isDirectory) {
        await this.walk(childRel, `${absDir}/${entry.name}`, out);
      } else if (entry.name.endsWith(".md")) {
        out.push(childRel);
      }
    }
  }

  /** Informational drift (FR-010): does the on-disk content differ from the recorded write?
   *  Only meaningful when a write log is wired and the file is managed. */
  private async detectDrift(relPath: string, abs: string, raw: string): Promise<boolean> {
    if (!this.log) return false;
    const recorded = await this.log.get(relPath);
    if (!recorded) return false;
    const current = await computeFingerprint(this.fs, abs, raw);
    return contentChanged(recorded, current);
  }
}
