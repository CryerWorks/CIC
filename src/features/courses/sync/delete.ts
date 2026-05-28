/**
 * Remove a Course, reconciling its Obsidian MOC (contracts/course-sync.md). Like materialize, the
 * one layer that bridges `src/vault` and `src/db` — never the UI or the repos directly. The vault
 * is sacred, so the user picks what happens to the `.md`:
 *
 *  - `detach`     — keep the note: strip the CIC discriminator (`cic-type` / `cic-id`) via the
 *                   writer so a rescan won't re-import it, leaving the body (incl. Reflections)
 *                   verbatim. Never deletes a vault file.
 *  - `deleteFile` — hard-delete the MOC through `VaultWriter.deleteNote`, under the same
 *                   never-clobber guard as a write (drift/unmanaged → conflict unless `overwrite`).
 *
 * The DB rows always go (cascade removes milestones etc.); on a `deleteFile` conflict we surface
 * it and leave both the file AND the rows intact so the user can retry or cancel.
 */

import { getCourse, deleteCourse as deleteCourseRow } from "../../../db";
import type { CourseSyncDeps } from "./materialize";

export type DeleteCourseMode = "detach" | "deleteFile";

export type RemoveCourseResult =
  | { status: "removed" }
  | { status: "conflict"; reason: "drifted" | "unmanaged"; mocPath: string };

export interface RemoveCourseOptions {
  /** Force a `deleteFile` past a never-clobber conflict, after explicit user confirmation. */
  overwrite?: boolean;
}

/** Strip the CIC discriminator from a MOC so it is no longer recognized as a Course on rescan,
 *  preserving the body verbatim. Uses `overwrite` because we re-write exactly what is on disk
 *  minus two frontmatter keys — no user content is lost, so there is nothing to clobber. */
async function detachMoc(deps: CourseSyncDeps, mocPath: string): Promise<void> {
  const { vault } = deps;
  if (!(await vault.reader.exists(mocPath))) return;

  let note;
  try {
    note = await vault.reader.readNote(mocPath);
  } catch {
    return; // unparseable frontmatter → leave the file untouched rather than risk mangling it
  }

  const frontmatter = { ...note.data };
  delete frontmatter["cic-type"];
  delete frontmatter["cic-id"];
  await vault.writer.writeNote(mocPath, { frontmatter, body: note.body }, { overwrite: true });
}

/** Remove a Course from CIC, reconciling its MOC per `mode`. Returns a conflict (file + rows left
 *  intact) only when a hard-delete hits never-clobber drift. */
export async function removeCourse(
  deps: CourseSyncDeps,
  courseId: string,
  mode: DeleteCourseMode,
  opts: RemoveCourseOptions = {},
): Promise<RemoveCourseResult> {
  const { vault, db } = deps;
  const course = await getCourse(db, courseId);

  if (course?.moc_path) {
    if (mode === "deleteFile") {
      const res = await vault.writer.deleteNote(course.moc_path, { overwrite: opts.overwrite });
      if (res.status === "conflict") {
        return { status: "conflict", reason: res.reason, mocPath: course.moc_path };
      }
    } else {
      await detachMoc(deps, course.moc_path);
    }
  }

  await deleteCourseRow(db, courseId);
  return { status: "removed" };
}
