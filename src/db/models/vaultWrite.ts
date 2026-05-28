import { z } from "zod";

/** External-edit detection metadata (PRD §13 conflict UX): the last mtime + content hash the
 *  app wrote for a vault file, keyed by `file_path` (natural PK). The vault feature records
 *  this on each write and compares against disk to detect concurrent Obsidian edits. 003 only
 *  models + round-trips it (FR-009); it stores metadata *about* vault files, never their content. */
export const VaultWriteSchema = z.object({
  file_path: z.string(),
  app_mtime: z.string(),
  app_hash: z.string(),
});

export type VaultWrite = z.infer<typeof VaultWriteSchema>;
