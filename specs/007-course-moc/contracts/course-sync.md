# Contract: Course Sync (materialize + rescan)

**Location**: `src/features/courses/sync/` | Composes `src/vault` (reader/writer) + `src/db` (repos) + `features/courses/moc` (pure). This is the only layer that bridges the three. **No React.** Dependencies are injected so the layer is testable over a `node:fs` temp vault + `node:sqlite`.

## Shared dependency shape

```ts
interface CourseSyncDeps {
  vault: Vault;        // { reader, writer } from useVault() / createVault()
  db: SqlExecutor;     // the ready store
}
```

## materialize.ts

```ts
type MaterializeResult =
  | { status: "written"; mocPath: string }
  | { status: "conflict"; mocPath: string; reason: "drifted" | "unmanaged" };

// Create or update the MOC for one course, then persist its moc_path.
materializeCourse(deps, courseId: string): Promise<MaterializeResult>;
```

**Behavior**:
1. Load the Course + its Milestones + Domain name + Campaign title → build a `MocModel`. (Capability comes from the caller's edit state; see the hook contract — `materializeCourse` accepts the capability text via an overload or the model is assembled by the caller. Implementation note: pass a ready `MocModel` in, OR pass `courseId` + `capability`; pick one in code and keep it consistent. Recommended: `materializeCourse(deps, model: MocModel)` — the hook owns assembling the model from form state + repo rows, keeping sync free of capability-storage questions.)
2. Determine the target path: existing `course.moc_path`, else `mocRelPathFor(title, takenPaths)` (taken = all current `moc_path`s).
3. If the file exists: `reader.readNote(path)` → `mergeMocBody(existing.body, model)`; else `renderMocBody(model)`.
4. `writer.writeNote(path, { frontmatter: buildFrontmatter(model), body })`.
   - `written` → if `course.moc_path` was null/changed, `updateCourse(db, id, { mocPath: path })`; return `{ status: "written", mocPath }`.
   - `conflict` → return `{ status: "conflict", mocPath, reason }` (do **not** force; the UI offers Reload & reapply — R5).
5. A `Reload & reapply` resolution path re-reads the current file, re-merges, and writes with `overwrite: true`.

**MUST**: never write when no vault is ready (the hook gates this; sync assumes a ready vault). Never delete a file. All writes via `writer` only.

## rescan.ts

```ts
type RescanOutcome = "imported" | "updated" | "unchanged" | "skipped";
interface RescanFileResult { path: string; outcome: RescanOutcome; courseId?: string; note?: string; }
interface RescanReport { results: RescanFileResult[]; imported: number; updated: number; skipped: number; }

rescanCourses(deps): Promise<RescanReport>;
```

**Behavior** (per R7), for each path from `reader.list()`:
1. `readNoteAs(path, MocCourseFrontmatterSchema)`:
   - `ok:false` → **skip silently** (not a CIC course MOC, or unreadable frontmatter). Not counted as an error.
2. `parseMocBody(note.raw body)`:
   - `MocParseError` → `skipped` with `note` (FR-019) — it *looked* like a course MOC (frontmatter valid) but the body is broken.
3. Resolve `domain` name → id (`findOrCreateDomainByName`, default color) and `campaign` title → id (`findOrCreateCampaignByTitle`) within that domain.
4. `upsertCourseRow(db, { id: cic-id, title, domainId, campaignId, mocPath: path })`.
   - existing course with the same `cic-id` → `updated` (and `moc_path` corrected if the file moved); new `cic-id` → `imported`.
5. `syncCourseMilestones(db, courseId, parsed.milestones)` (mint ids for comment-less user lines first).
6. Tally the report.

**MUST**: be safe to run repeatedly (idempotent — a second rescan with no file changes yields all `unchanged`/`updated`-noop and zero data loss). Never write to the vault. Never delete a vault file.

## Test obligations (integration, node temp vault + node sqlite)
- **materialize/new**: a Course with 2 milestones → file exists at `Courses/<Title>.md` with capability + both milestone lines; `course.moc_path` set.
- **materialize/update preserves user text**: write MOC, append a paragraph under `## Reflections` on disk, change a milestone in-app, materialize → milestone updated, Reflections paragraph intact (SC-002).
- **materialize/drift**: externally edit the managed region after the app's last write, materialize → `conflict("drifted")`; Reload & reapply → `written`, no data loss.
- **rescan/round-trip**: materialize, edit capability + add a milestone line on disk, `rescanCourses` → course capability + milestones match the file (SC-003).
- **rescan/import**: hand-write a valid CIC course MOC (new `cic-id`) → `rescanCourses` imports it as a Course (+ creates the named Domain) (SC-006).
- **rescan/ignore**: a plain `.md` with no `cic-type` → skipped, no Course created.
- **rescan/malformed**: a `cic-type: course` file with an unterminated marker → `skipped` with a note, other files still reconcile (FR-019).
- **rescan/idempotent**: two consecutive rescans, second is a no-op (no duplicate milestones/courses).
- **never-delete**: no sync path calls `fs.remove` on a vault file (only the writer's temp-file cleanup).
