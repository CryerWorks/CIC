/**
 * Pure vault-path safety (research R6) — NO I/O, NO `node:path` (this runs in the Tauri webview
 * too, where `node:path` does not exist). The single place the vault boundary is enforced
 * (FR-011/012): every reader/writer operation resolves through here before touching the fs, so
 * no adapter or caller can bypass it. Tolerant of Windows (`\`) and POSIX (`/`) separators.
 */

import { VaultPathError } from "./errors";

const OBSIDIAN_DIR = ".obsidian";

/** Does `p` look like an absolute path? Covers POSIX (`/foo`), Windows drive (`C:\`, `C:/`),
 *  and UNC (`\\server`). */
function isAbsolute(p: string): boolean {
  return /^([/\\]|[A-Za-z]:[/\\]?|\\\\)/.test(p);
}

/** Strip a single trailing separator from the vault root so joins don't double up. */
function stripTrailingSep(p: string): string {
  return p.replace(/[/\\]+$/, "");
}

/**
 * Validate + normalize a vault-relative path and resolve it to an absolute path guaranteed
 * inside `vaultPath`. Throws `VaultPathError` on an absolute input, any `..`/escaping segment,
 * or anything under `.obsidian/`.
 *
 * `relPath` of `""` or `"."` resolves to the vault root itself (used by `list()` to walk from
 * the top); it is valid for directory traversal, not for reading a note.
 */
export function resolveVaultPath(vaultPath: string, relPath: string): string {
  if (isAbsolute(relPath)) {
    throw new VaultPathError(relPath, "absolute");
  }

  const rawSegments = relPath.split(/[/\\]+/);
  const segments: string[] = [];
  for (const seg of rawSegments) {
    if (seg === "" || seg === ".") continue; // collapse empty + current-dir markers
    if (seg === "..") {
      // Reject any traversal outright — even one that would stay in-vault. Conservative and
      // trivially correct for a "sacred vault" (an in-vault `a/../b` has no legitimate use here).
      throw new VaultPathError(relPath, "escapes-vault");
    }
    if (seg === OBSIDIAN_DIR) {
      throw new VaultPathError(relPath, "obsidian-config");
    }
    segments.push(seg);
  }

  const base = stripTrailingSep(vaultPath);
  return segments.length ? `${base}/${segments.join("/")}` : base;
}

/** Join an already-validated relative prefix with a child name (used while walking the tree in
 *  `list`, where each `name` came from `readDir` and is a single safe segment). */
export function joinRelative(relPrefix: string, name: string): string {
  return relPrefix ? `${relPrefix}/${name}` : name;
}
