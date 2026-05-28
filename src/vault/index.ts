/**
 * Public surface of the `src/vault` knowledge-persistence spine (Constitution I + IV). Features
 * (course authoring, notes, sync, …) depend on THIS — never on `@tauri-apps/plugin-fs`, raw
 * `fs`, `src/db` internals, or the test-only node adapter (deliberately NOT exported here).
 * Adding an export is additive; changing a signature or the never-clobber default is breaking.
 */

// Composition root — the one way to obtain a production reader/writer.
export { createVault } from "./bootstrap";
export type { Vault } from "./bootstrap";

// The seam + its low-level types (a feature implementing a custom backend would target these).
export type { VaultFs, VaultStat, VaultDirent } from "./fs";

// Reader / writer surfaces (instances come from createVault; these are the types to annotate with).
export type { VaultReader, RawNote } from "./reader";
export type { VaultWriter, NoteInput, WriteOptions, DeleteOptions } from "./writer";

// The conflict-log seam (implemented over the 003 vault_writes repo at the composition root).
export type { VaultWriteLog } from "./writeLog";

// Result + value shapes.
export type { Fingerprint, VaultNote, ReadOutcome, WriteResult, DeleteResult } from "./errors";

// Typed errors (values — for `instanceof` checks at call sites).
export { VaultPathError, FrontmatterParseError } from "./errors";
