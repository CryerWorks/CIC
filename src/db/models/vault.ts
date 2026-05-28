import { z } from "zod";

/**
 * A connected Obsidian vault as CIC tracks it (Feature 009). `id` is the stable UUID held in the
 * in-vault marker (`.cic/vault.json`) — it survives folder rename/move; `path` is the last-connected
 * folder, refreshed on every connect. The owner of a per-vault dataset (Domains scope to it).
 *
 * NB: this DB row is distinct from the 005 runtime `Vault` handle (`{ reader, writer, identity }`);
 * the suffix keeps the two from colliding.
 */
export const VaultRecordSchema = z.object({
  id: z.string(),
  path: z.string(),
  created_at: z.string(),
});

export type VaultRecord = z.infer<typeof VaultRecordSchema>;
