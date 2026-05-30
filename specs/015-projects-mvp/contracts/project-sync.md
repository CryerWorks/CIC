# Contract: Project Sync Layer (`src/features/projects/sync/`)

Bridges the DB repo + the pure `doc/` module to the vault via `VaultReader`/`VaultWriter`. Mirrors `src/features/courses/sync/`. The only place Project `.md` files are written/deleted. Node-tested against a real temp vault + `NodeSqlExecutor`.

---

## `deps.ts`

```ts
export interface ProjectSyncDeps {
  db: SqlExecutor;
  vault: Vault;          // { reader: VaultReader; writer: VaultWriter } — from the composition root
}
```

## `materialize.ts`

```ts
export type MaterializeProjectResult =
  | { status: "written"; projectPath: string }
  | { status: "conflict"; projectPath: string; reason: "drifted" | "unmanaged" };

export async function materializeNewProject(
  deps: ProjectSyncDeps, model: ProjectDocModel, framing?: string | null,
): Promise<MaterializeProjectResult>;
// Creation: path = projectFilename(title, id). writeNote(path, renderProjectDoc(model, framing)
// → { frontmatter, body }, { overwrite: false }). The optional framing is woven into the Problem
// section once (M1). On success, set projects.project_path.

export async function updateProjectFrontmatter(
  deps: ProjectSyncDeps, model: ProjectDocModel,
): Promise<MaterializeProjectResult>;
// Status/title/capability change: read existing file → swapFrontmatter(existingBody, model) →
// writeNote(path, …, { overwrite:false }). Body kept verbatim. Drift/unmanaged → typed conflict.

export async function closeProjectFile(
  deps: ProjectSyncDeps, model: ProjectDocModel, reflection: string,
): Promise<MaterializeProjectResult>;
// Close: read existing → body' = appendReflection(existingBody, reflection, model.closedDate!) →
// writeNote(path, { frontmatter: buildFrontmatter(model), body: body' }, { overwrite:false }).

export async function reapplyProject(
  deps: ProjectSyncDeps, model: ProjectDocModel,
): Promise<MaterializeProjectResult>;
// Drift escape hatch: re-read, swapFrontmatter, writeNote with { overwrite:true } (resolves the
// "unmanaged" first-write-after-import case, mirroring 007 reapplyCourse).
```

## `rescan.ts`

```ts
export interface RescanProjectsReport {
  results: { path: string; outcome: "imported" | "updated" | "skipped"; note?: string }[];
  imported: number; updated: number; skipped: number;
}

export async function rescanProjects(
  deps: ProjectSyncDeps, vaultId: string,
): Promise<RescanProjectsReport>;
// Vault-READ-ONLY. list() all .md → for each: readNoteAs(path, ProjectFrontmatterSchema) discriminated
// by cic-type: project. Resolve the Course by the frontmatter's `course-id` (the Course's durable
// cic-id) — NEVER by the human `course` title (M2); skip with a note if no Course in this vault has
// that id (MVP: a Project file's Course must already exist). upsertImportedProject(by cic-id),
// reconciling project_milestones to the frontmatter's milestone ids (unknown ids dropped → a Project
// may legitimately import with 0 milestones, M3). Malformed → skip with note. Idempotent. Never
// writes/deletes.
```

## `delete.ts`

```ts
export type DeleteProjectMode = "detach" | "deleteFile";
export type RemoveProjectResult =
  | { status: "removed" }
  | { status: "conflict"; reason: "drifted" | "unmanaged"; projectPath: string };

export async function removeProject(
  deps: ProjectSyncDeps, projectId: string, mode: DeleteProjectMode,
  opts?: { overwrite?: boolean },
): Promise<RemoveProjectResult>;
// detach:     read file → strip cic-type/cic-id from frontmatter → writeNote({ overwrite:true })
//             (body + everything else preserved; won't re-import), THEN deleteProject(db).
// deleteFile: deleteNote(projectPath, { overwrite: opts?.overwrite }); on drift/unmanaged return
//             conflict (file + rows intact) unless overwrite:true. On success → deleteProject(db).
// DB rows are removed only AFTER the vault op succeeds (or immediately, for a project with no file).
```

## Behavior guarantees

- **Never-clobber**: every write/delete goes through `VaultWriter` with the fingerprint guard; a drift/unmanaged conflict returns a typed result (no throw, no silent overwrite) and leaves the DB untouched until resolved.
- **Body integrity**: after the first creation write, no sync path ever rewrites the body except the single additive reflection append on close.
- **Read-only rescan**: `rescanProjects` performs zero writes/deletes.
- **Atomicity at the boundary**: file op first, then DB; a failed/conflicted file op does not orphan DB state.
