/**
 * The vault layer's typed result + error shapes (data-model.md). The reader/writer return these
 * rather than throwing on expected conditions (malformed frontmatter, a detected conflict, an
 * unsafe path) — so a caller never crashes on a bad note (Constitution: "never crash on a
 * malformed note") and the never-clobber outcome is forced into the type system.
 */

import type { ZodError } from "zod";

/** Why a vault-relative path was rejected by the pure validator, before any I/O (FR-011/012). */
export type PathRejection = "absolute" | "escapes-vault" | "obsidian-config" | "empty";

/** A vault-relative path failed `resolveVaultPath`. Thrown (not returned) — an unsafe path is a
 *  programming/caller error, not an expected runtime condition, and must never reach the fs. */
export class VaultPathError extends Error {
  constructor(
    readonly relPath: string,
    readonly reason: PathRejection,
  ) {
    super(`Unsafe vault path rejected (${reason}): ${JSON.stringify(relPath)}`);
    this.name = "VaultPathError";
  }
}

/** Frontmatter could not be parsed (bad YAML) or failed the caller's zod schema (FR-002).
 *  Returned inside a `ReadOutcome`, never thrown to a crash. */
export class FrontmatterParseError extends Error {
  constructor(
    readonly path: string,
    message: string,
    /** Present when the failure was schema validation (vs unparseable YAML). */
    readonly issues?: ZodError,
  ) {
    super(message);
    this.name = "FrontmatterParseError";
  }
}

/** External-edit detection primitive (research R5): the file's mtime + a SHA-256 of its text.
 *  Recorded after a successful write; compared on the next write to detect Obsidian edits. */
export interface Fingerprint {
  /** ISO-8601 modification time. */
  mtime: string;
  /** SHA-256 hex digest of the full file text. The authoritative content-identity signal. */
  hash: string;
}

/** A parsed + schema-validated note (data-model.md). */
export interface VaultNote<T> {
  /** Vault-relative path. */
  path: string;
  /** Frontmatter parsed by gray-matter and validated against the caller's schema. */
  frontmatter: T;
  /** The Markdown body (byte-faithful round-trip). */
  body: string;
  /** The full original file text. */
  raw: string;
}

/** Outcome of `readNoteAs` (FR-002/010): the validated note, or a typed parse/validation
 *  failure — never a thrown crash. `drift` is informational (FR-010): the on-disk fingerprint
 *  differs from the app's recorded one. The content is returned regardless of drift. */
export type ReadOutcome<T> =
  | { ok: true; note: VaultNote<T>; drift: boolean }
  | { ok: false; error: FrontmatterParseError; drift: boolean };

/** The never-clobber write outcome (FR-006/009). On `written` the new fingerprint was recorded;
 *  on `conflict` the file was left exactly as it is on disk. `recorded` is absent for an
 *  unmanaged file (one the app never wrote). */
export type WriteResult =
  | { status: "written"; fingerprint: Fingerprint }
  | {
      status: "conflict";
      reason: "drifted" | "unmanaged";
      current: Fingerprint;
      recorded?: Fingerprint;
    };
