/**
 * Materialize a Project as its vault Markdown file (contracts/project-sync.md). Composes the pure
 * Project document module with the vault writer + the projects repository — the only layer that
 * bridges `src/vault` and `src/db` for Projects. The body is **learner-owned**: a brand-new file
 * gets the rendered template body; thereafter the app only ever swaps the **frontmatter**, keeping
 * the body byte-for-byte (the one exception is the additive reflection append on close — research
 * R2/R3). All writes go through the single `VaultWriter`; on never-clobber drift a typed conflict is
 * returned rather than forcing.
 */

import { getProject, listProjectPaths, setProjectPath } from "../../../db";
import {
  renderProjectDoc,
  swapFrontmatter,
  appendReflection,
  projectRelPathFor,
  type ProjectDocModel,
} from "../doc";
import type { ProjectSyncDeps } from "./deps";

export type MaterializeProjectResult =
  | { status: "written"; projectPath: string }
  | { status: "conflict"; projectPath: string; reason: "drifted" | "unmanaged" };

interface WriteOpts {
  overwrite?: boolean;
  /** Creation only — woven into the Problem section of the fresh template body (M1). */
  framing?: string | null;
  /** Close only — appended additively to the existing body under a Reflection heading (R3). */
  reflection?: string | null;
}

async function writeProject(
  deps: ProjectSyncDeps,
  model: ProjectDocModel,
  opts: WriteOpts,
): Promise<MaterializeProjectResult> {
  const { vault, db } = deps;
  const existing = await getProject(db, model.id);
  const path = existing?.project_path ?? projectRelPathFor(model.title, await listProjectPaths(db));

  let note: { frontmatter: Record<string, unknown>; body: string };
  if (await vault.reader.exists(path)) {
    const body = (await vault.reader.readNote(path)).body;
    const swapped = swapFrontmatter(body, model);
    const finalBody =
      opts.reflection && model.closedDate
        ? appendReflection(swapped.body, opts.reflection, model.closedDate)
        : swapped.body;
    note = { frontmatter: swapped.frontmatter, body: finalBody };
  } else {
    note = renderProjectDoc(model, opts.framing);
  }

  const result = await vault.writer.writeNote(path, note, { overwrite: opts.overwrite ?? false });
  if (result.status === "conflict") {
    return { status: "conflict", projectPath: path, reason: result.reason };
  }
  if (existing?.project_path !== path) {
    await setProjectPath(db, model.id, path);
  }
  return { status: "written", projectPath: path };
}

/** Create a Project's file (or write a never-yet-materialized one). The optional `framing` seeds the
 *  Problem section once (M1). Honors never-clobber. */
export function materializeNewProject(
  deps: ProjectSyncDeps,
  model: ProjectDocModel,
  framing?: string | null,
): Promise<MaterializeProjectResult> {
  return writeProject(deps, model, { overwrite: false, framing });
}

/** A status / title / capability change: rewrite the frontmatter only, body kept verbatim. */
export function updateProjectFrontmatter(
  deps: ProjectSyncDeps,
  model: ProjectDocModel,
): Promise<MaterializeProjectResult> {
  return writeProject(deps, model, { overwrite: false });
}

/** Close: swap frontmatter (now `complete`/`abandoned` + `closed`) and append the reflection prose. */
export function closeProjectFile(
  deps: ProjectSyncDeps,
  model: ProjectDocModel,
  reflection: string,
): Promise<MaterializeProjectResult> {
  return writeProject(deps, model, { overwrite: false, reflection });
}

/** Drift escape hatch (mirrors `reapplyCourse`): re-read + re-swap frontmatter, write with
 *  `overwrite` — the sanctioned use after the user confirms. Body preserved. */
export function reapplyProject(
  deps: ProjectSyncDeps,
  model: ProjectDocModel,
): Promise<MaterializeProjectResult> {
  return writeProject(deps, model, { overwrite: true });
}
