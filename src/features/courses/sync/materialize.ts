/**
 * Materialize a Course as its Obsidian MOC (contracts/course-sync.md). Composes the pure MOC
 * document module with the vault writer + the course repository — the only layer that bridges
 * `src/vault` and `src/db`. New file → `renderMocBody`; existing file → `mergeMocBody` (so user
 * regions are preserved). All writes go through the single `VaultWriter`; on never-clobber
 * drift it returns a typed conflict rather than forcing.
 */

import type { SqlExecutor } from "../../../db";
import { getCourse, listCourses, updateCourse } from "../../../db";
import type { Vault } from "../../../vault";
import {
  buildFrontmatter,
  mergeMocBody,
  mocRelPathFor,
  renderMocBody,
  type MocModel,
} from "../moc";

export interface CourseSyncDeps {
  vault: Vault;
  db: SqlExecutor;
}

export type MaterializeResult =
  | { status: "written"; mocPath: string }
  | { status: "conflict"; mocPath: string; reason: "drifted" | "unmanaged" };

/** Resolve the MOC path for a course: its existing `moc_path`, else a fresh unique slug. */
async function resolvePath(db: SqlExecutor, model: MocModel, existingPath: string | null): Promise<string> {
  if (existingPath) return existingPath;
  const taken = (await listCourses(db))
    .map((c) => c.moc_path)
    .filter((p): p is string => p !== null);
  return mocRelPathFor(model.title, taken);
}

export async function materializeCourse(
  deps: CourseSyncDeps,
  model: MocModel,
): Promise<MaterializeResult> {
  const { vault, db } = deps;

  const existing = await getCourse(db, model.id);
  const path = await resolvePath(db, model, existing?.moc_path ?? null);

  const body = (await vault.reader.exists(path))
    ? mergeMocBody((await vault.reader.readNote(path)).body, model)
    : renderMocBody(model);

  const result = await vault.writer.writeNote(path, {
    frontmatter: buildFrontmatter(model),
    body,
  });

  if (result.status === "conflict") {
    return { status: "conflict", mocPath: path, reason: result.reason };
  }

  if (existing?.moc_path !== path) {
    await updateCourse(db, model.id, { mocPath: path });
  }
  return { status: "written", mocPath: path };
}
