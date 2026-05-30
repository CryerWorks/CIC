/**
 * Remove a Project, reconciling its vault file (contracts/project-sync.md). Mirrors `removeCourse`.
 * The vault is sacred, so the learner picks what happens to the `.md`:
 *
 *  - `detach`     — keep the file: strip the CIC discriminator (`cic-type` / `cic-id`) via the
 *                   writer so a rescan won't re-import it, leaving the body verbatim. Never deletes.
 *  - `deleteFile` — hard-delete via `VaultWriter.deleteNote`, under the same never-clobber guard as a
 *                   write (drift/unmanaged → conflict unless `overwrite`).
 *
 * The DB rows always go (cascade clears the join tables; `sessions`/`cards` `project_id` reset to
 * NULL); on a `deleteFile` conflict we surface it and leave both the file AND the rows intact.
 */

import { getProject, deleteProject as deleteProjectRow } from "../../../db";
import type { ProjectSyncDeps } from "./deps";

export type DeleteProjectMode = "detach" | "deleteFile";

export type RemoveProjectResult =
  | { status: "removed" }
  | { status: "conflict"; reason: "drifted" | "unmanaged"; projectPath: string };

export interface RemoveProjectOptions {
  /** Force a `deleteFile` past a never-clobber conflict, after explicit user confirmation. */
  overwrite?: boolean;
}

/** Strip the CIC discriminator so the file is no longer recognized as a Project on rescan,
 *  preserving the body verbatim (uses `overwrite` because we re-write exactly what's on disk minus
 *  two frontmatter keys — nothing to clobber). */
async function detachFile(deps: ProjectSyncDeps, projectPath: string): Promise<void> {
  const { vault } = deps;
  if (!(await vault.reader.exists(projectPath))) return;

  let note;
  try {
    note = await vault.reader.readNote(projectPath);
  } catch {
    return; // unparseable frontmatter → leave untouched rather than risk mangling it
  }

  const frontmatter = { ...note.data };
  delete frontmatter["cic-type"];
  delete frontmatter["cic-id"];
  await vault.writer.writeNote(projectPath, { frontmatter, body: note.body }, { overwrite: true });
}

export async function removeProject(
  deps: ProjectSyncDeps,
  projectId: string,
  mode: DeleteProjectMode,
  opts: RemoveProjectOptions = {},
): Promise<RemoveProjectResult> {
  const { vault, db } = deps;
  const project = await getProject(db, projectId);

  if (project?.project_path) {
    if (mode === "deleteFile") {
      const res = await vault.writer.deleteNote(project.project_path, { overwrite: opts.overwrite });
      if (res.status === "conflict") {
        return { status: "conflict", reason: res.reason, projectPath: project.project_path };
      }
    } else {
      await detachFile(deps, project.project_path);
    }
  }

  await deleteProjectRow(db, projectId);
  return { status: "removed" };
}
