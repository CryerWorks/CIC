/**
 * Content fingerprinting for external-edit detection (research R5). Hashing uses the Web Crypto
 * API (`crypto.subtle`), present in both the Tauri webview and Node — so the same code path runs
 * in production and tests.
 */

import type { Fingerprint } from "./errors";
import type { VaultFs } from "./fs";

/** SHA-256 hex digest of a string. */
export async function hashText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compute a file's fingerprint from its current on-disk stat + text. */
export async function computeFingerprint(
  fs: VaultFs,
  absPath: string,
  text: string,
): Promise<Fingerprint> {
  const stat = await fs.stat(absPath);
  return { mtime: new Date(stat.mtimeMs).toISOString(), hash: await hashText(text) };
}

/**
 * Has the file's *content* changed since the recorded fingerprint? Decided by **hash**, not
 * mtime: a pure mtime change with identical bytes (a `touch`, a sync tool, Obsidian rewriting
 * identical content) must NOT register as an external edit (research R5 — "avoid false positives
 * from mtime-only churn"). mtime is still recorded, for the future file-watcher's cheap
 * first-line check.
 */
export function contentChanged(recorded: Fingerprint, current: Fingerprint): boolean {
  return recorded.hash !== current.hash;
}
