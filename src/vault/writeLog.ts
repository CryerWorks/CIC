/**
 * `VaultWriteLog` — the app's record of the last fingerprint it wrote for each vault file, the
 * signal that powers conflict detection (PRD §13). It is an *interface* so `src/vault` never
 * imports `src/db` (Constitution IV — no leaky abstraction; research R7): the composition root
 * (`bootstrap.ts`) backs it with the Feature 003 `vault_writes` repository, while tests inject a
 * trivial in-memory implementation to exercise the writer's conflict logic without a database.
 */

import type { Fingerprint } from "./errors";

export interface VaultWriteLog {
  /** The fingerprint last recorded for `relPath`, or `null` if the app never wrote it
   *  (the "unmanaged" case the conflict state machine treats as a conflict). */
  get(relPath: string): Promise<Fingerprint | null>;
  /** Record `relPath`'s fingerprint after a successful write (FR-008); upserts on the path. */
  record(relPath: string, fingerprint: Fingerprint): Promise<void>;
  /** Drop `relPath`'s record after its note is deleted, so a file later appearing at the same
   *  path is treated as "unmanaged" (a conflict) rather than silently overwritable. Idempotent. */
  forget(relPath: string): Promise<void>;
}
