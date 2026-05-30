import type { SqlExecutor } from "../../../db";
import type { Vault } from "../../../vault";

/** What the Project sync layer needs: the db seam + the vault reader/writer. Mirrors
 *  `CourseSyncDeps` — the only layer that bridges `src/db` and `src/vault` for Projects. */
export interface ProjectSyncDeps {
  vault: Vault;
  db: SqlExecutor;
}
