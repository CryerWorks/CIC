# Research: Course Authoring & MOC Materialization

**Feature**: 007-course-moc | **Date**: 2026-05-28

Decisions resolving the design unknowns surfaced in the plan's Technical Context. No `NEEDS CLARIFICATION` remained from the spec; these are implementation-design choices.

---

## R1 — Where the feature lives, and how UI gates on the vault

**Decision**: House the whole feature under `src/features/courses/` (pure `moc/`, `sync/`, hook, components, route). The Courses screen reads `useVaultState()`; it only enables materialization when the state is `ready`. When `unset`/`unavailable`, it renders guidance linking to `/vault` (mirrors the 006 Dashboard first-run banner) and does **not** create unmaterializable Courses.

**Rationale**: CLAUDE.md's target structure names `features/courses/` as the F1 home. Gating on `useVaultState()` (not calling `useVault()` unconditionally) avoids the throw-when-not-ready contract of `useVault()` (VaultProvider.tsx:153) and gives a clean empty/guidance state. FR-014 + the "no vault connected" edge case.

**Alternatives considered**: Putting UI under `src/app/routes/courses/` to match the Domains precedent — rejected: this feature's non-UI logic (document + sync) is substantial and belongs together under `features/`. Auto-creating a Course in SQLite when no vault is connected and materializing later — rejected: leaves orphaned, invisible rows and contradicts "a Course is the thing backed by a MOC".

---

## R2 — The MOC marker contract (uniform, marker-delimited app-managed sections)

**Decision**: Treat **all** app-managed sections as delimited by paired HTML-comment markers, including Capability:

```markdown
## Capability
<!-- cic:capability -->
<one paragraph>
<!-- /cic:capability -->

## Milestones
<!-- cic:milestones -->
- [ ] Define a limit <!-- cic:m id=<uuid> status=todo -->
- [x] Prove continuity <!-- cic:m id=<uuid> status=done -->
<!-- /cic:milestones -->

## Resources
<!-- cic:resources -->
<!-- /cic:resources -->

## Active Projects
<!-- cic:projects -->
<!-- /cic:projects -->

## Recent Sessions
<!-- cic:sessions -->
<!-- /cic:sessions -->

## Notes
<!-- cic:notes -->
<!-- /cic:notes -->

## Reflections
<!-- user-owned — the app never writes here -->
```

The canonical app-managed section order is: `capability, milestones, resources, projects, sessions, notes`. For Feature 007, only `capability` and `milestones` carry content; the rest are written as empty marker pairs (skeletons reserved for later features). `## Reflections` and any content outside all markers are user-owned and never written.

**Rationale**: The locked v0.7 template (PRD §F1) shows `## Capability` as a bare paragraph, but the same section states "app-managed sections in MOCs are delimited by `<!-- cic:* -->` markers." Capability is app-managed (it round-trips with the Course record), so wrapping it in markers makes the merge/parse logic **uniform** — every replaceable region is "the text between an open and close marker." This is the safest never-clobber design: we only ever rewrite strictly *inside* a marker pair, so user prose anywhere else (even between sections) is byte-preserved. HTML comments are invisible in Obsidian's reading view, so the MOC stays clean for humans.

**Action**: This is a small, spirit-compliant clarification of the locked template. Flag to the user and propose adding capability markers to the PRD §F1 template snippet (SOP: design decisions extend the PRD, not code comments).

**Alternatives considered**: Heading-delimited Capability (replace text between `## Capability` and the next `##`) — rejected: a second parsing mode (heading-scoped vs marker-scoped) doubles the merge/parse surface and is more fragile if the user reorders or renames headings. Treating the whole span from the first managed heading to the Notes block as one regenerated region — rejected: would clobber any user prose a person added between marker blocks.

---

## R3 — Milestone line format (faithful 3-state round-trip with stable identity)

**Decision**: Each milestone renders as a task-list line carrying a trailing HTML-comment with its stable id and status:

```
- [ ] <capability text> <!-- cic:m id=<uuid> status=todo -->
- [/] <capability text> <!-- cic:m id=<uuid> status=in-progress -->
- [x] <capability text> <!-- cic:m id=<uuid> status=done -->
```

The checkbox mirrors status for human readability (`[ ]` todo, `[/]` in-progress, `[x]` done — `[/]` is a widely-recognized "partial" convention). The **trailing comment is authoritative** on read-back for both `id` and `status`; the checkbox glyph is a rendered affordance. Capability text is everything between the `]` and the trailing comment, trimmed.

**Rationale**: Milestone status is a 3-value enum (`todo`/`in-progress`/`done`, enums.ts:9) — a binary checkbox can't represent it, so an explicit `status=` token is needed for a faithful round-trip. A stable `id` in the line lets read-back match/reorder/retire milestones precisely (and lets future Cards cite a milestone by id) even when the user reorders lines or edits capability text in Obsidian. The comment is invisible in reading view.

**Edge handling**: A milestone line whose trailing comment is missing/garbled but which is inside the `cic:milestones` block is treated as **user-added** on read-back: imported as a new milestone (new id minted, status from checkbox, `done` if `[x]` else `todo`). This lets a user add `- [ ] New goal` by hand in Obsidian and have it picked up (US3), without the app silently dropping it.

**Alternatives considered**: Checkbox-only (lose `in-progress`) — rejected: not faithful. Status as a visible tag (`#in-progress`) — rejected: pollutes the rendered note and collides with the user's own tags. Order-by-position only (no id) — rejected: can't distinguish a reorder from an edit; breaks future card→milestone citations.

---

## R4 — Merge strategy: marker-scoped replacement preserving everything else

**Decision**: `mergeMocBody(existingBody, model)` operates per marker pair:
1. For each managed section in canonical order, if its `<!-- cic:x -->…<!-- /cic:x -->` pair exists in `existingBody`, replace **only** the inner content with freshly rendered content.
2. If a managed pair is **absent** (the user deleted that section), re-insert the full section block (`## Heading` + marker pair + content) immediately before the first user-owned region (`## Reflections` if present) or, failing that, at end of file — so the app's data is always represented.
3. All other bytes — headings, blank lines, the Reflections section, and any unrecognized content — are left **exactly** as they were.

Creating a brand-new MOC uses `renderMocBody(model)` (the full template). Both paths are pure string functions.

**Rationale**: Replacing strictly inside markers is the minimal-surface, maximally-safe operation for the never-clobber guarantee (FR-010). Re-insertion of a deleted section keeps the app's state visible without fighting the user elsewhere. Purity makes the whole thing exhaustively unit-testable (idempotency: `merge(render(m), m) === render(m)`; preservation: arbitrary Reflections text survives N merges).

**Alternatives considered**: Full-body regeneration with a "user sections" allowlist — rejected: must enumerate user regions and still risks dropping interleaved prose. A 3-way structural diff — rejected: that's the deferred PRD §13 conflict UX, out of scope.

---

## R5 — Interaction with the writer's file-level never-clobber (drift)

**Decision**: Materialize-on-update reads the current MOC, merges, then calls `writer.writeNote(path, {frontmatter, mergedBody})`. The writer compares the on-disk fingerprint with the last recorded write (writer.ts:59):
- **No drift** → writes atomically, records the new fingerprint. Done.
- **Drift / unmanaged** → the writer returns a `conflict`; we do **not** force. The UI surfaces "this MOC changed in Obsidian since the app last saved it" (FR-012, US2-AS2) and offers a single non-destructive resolution for the MVP: **Reload & reapply** — re-read the now-current file, re-merge the app sections into it, and write with `overwrite: true` (now safely based on the latest on-disk content). The full 3-way diff stays out of scope.

**Rationale**: "Reload & reapply" resolves drift without data loss (it incorporates the user's external edits, then re-stamps only the managed sections) and reuses the writer's `overwrite` escape hatch (writer.ts:42) exactly as intended ("use only after the conflict is resolved"). It avoids stranding the user while staying within the never-clobber spirit.

**Alternatives considered**: Auto-overwrite on drift — rejected: violates never-clobber. Block all saves until manual file reconciliation — rejected: dead-ends the user with no in-app path forward.

---

## R6 — CIC Course MOC identity & frontmatter

**Decision**: A file is a CIC Course MOC iff its frontmatter parses against `MocCourseFrontmatterSchema` with `cic-type === "course"`. Frontmatter shape:

```yaml
cic-type: course        # discriminator
cic-id: <uuid>          # == course.id (stable identity across rename/move)
title: <string>         # human-facing; authoritative for course.title on read-back
domain: <string>        # domain NAME (human-friendly)
campaign: <string|null> # campaign TITLE or null
```

Read-back matches a file to a Course by `cic-id`. `cic-id` is the durable link (not `moc_path`), so a file renamed/moved in Obsidian still reconciles to the right Course; `course.moc_path` is updated to the file's current path when a moved file is found.

**Rationale**: A frontmatter discriminator cleanly separates "this is a CIC course" from arbitrary vault Markdown (FR-016/018) and survives renames (FR-016). Storing `domain`/`campaign` by human name keeps the MOC readable/editable; ids are resolved on import (R7). `readNoteAs(path, MocCourseFrontmatterSchema)` (reader.ts:51) does the discrimination *and* validation in one safe call — non-course or malformed-frontmatter files yield `ok:false` and are skipped.

**Alternatives considered**: A registry of known `moc_path`s only — rejected: can't detect hand-authored MOCs (FR-017) and breaks on rename. A hidden `.cic/` index file — rejected: violates "vault is human-readable Markdown"; duplicates the source of truth.

---

## R7 — Read-back reconciliation & domain/campaign resolution

**Decision**: `rescanCourses(deps)` walks `reader.list()`, and for each `.md`:
1. `readNoteAs(path, MocCourseFrontmatterSchema)` → if `ok:false` (not a course, or unreadable frontmatter) **skip silently** if it isn't a course; if it *is* flagged a course but the body fails to parse, record a **skip-with-notice** (FR-019).
2. Resolve `domain` by case-insensitive name → existing Domain id, else **create the Domain** (default palette color). Resolve `campaign` title within that domain → existing Campaign id, else create it. (A hand-authored course implies its domain/campaign should exist.)
3. Upsert the Course row by `cic-id` (`upsert(db,"courses",row,["id"])`), setting `title`, `domain_id`, `campaign_id`, `moc_path`.
4. `syncCourseMilestones(db, courseId, parsedMilestones)`: upsert each parsed milestone by id; delete course milestones whose id is absent from the file (the file is authoritative for the managed section). Order from line position.
Returns a `RescanReport` (per-file: `imported | updated | unchanged | skipped(reason)`).

**Rationale**: Closes US3 including import (FR-017, SC-006). Upsert-by-id + delete-missing makes the file authoritative for managed content while never touching user regions. Auto-creating a missing Domain/Campaign keeps import non-blocking; defaulting the color is harmless and user-editable later.

**Alternatives considered**: Reconcile-only (ignore unknown MOCs) — rejected: fails FR-017/SC-006. Refuse import when the domain doesn't exist — rejected: dead-ends a legitimate hand-authored course. Diff milestones by capability text — rejected: brittle vs id-based matching (R3).

---

## R8 — MOC filename & location

**Decision**: MOCs live in a `Courses/` subfolder of the vault. `mocRelPathFor(title, taken[])` slugifies the title (keep it human-readable: trim, collapse whitespace, strip characters illegal in filenames) into `Courses/<Title>.md`; on collision with an existing distinct course's path it appends ` (2)`, ` (3)`, … The path is stored in `course.moc_path` and is stable thereafter (an in-app rename updates the title/frontmatter/body but **keeps the existing file path** to avoid churn and dangling links; the human title in `## …`/frontmatter carries the rename).

**Rationale**: A dedicated folder keeps generated MOCs tidy and makes rescan scoping obvious. Human-readable filenames honor the "happy to see it in their vault" rule. Keeping the path stable on rename (identity lives in `cic-id`, not the filename) avoids delete+recreate (never delete a vault file) and avoids breaking any `[[wikilinks]]` a user made. FR-013 uniqueness via the `taken[]` collision suffix.

**Alternatives considered**: MOCs at vault root — rejected: clutters the vault. Renaming the file when the title changes — rejected: would require deleting/moving a vault file and could break user links; conflicts with never-delete.

---

## R9 — Repository additions stay in the db spine

**Decision**: Add `updateCourse`, `listCourses`, `getCourseByMocPath`, and an id-preserving `upsertCourseRow` to `courses.ts`; `updateMilestone`, `deleteMilestone`, and `syncCourseMilestones` to `milestones.ts`; a new `campaigns.ts` (`listCampaignsByDomain`, `createCampaign`, `getCampaign`). Export `campaigns` from `db/index.ts`. All built on the generic `insert/update/upsert/selectParsed` helpers (query.ts).

**Rationale**: Course/Campaign/Milestone are "core hierarchy", which db/index.ts:23 explicitly allows ergonomic repos for. Keeping persistence in `src/db` (not in the feature) preserves the spine boundary (Constitution IV) and lets the sync layer and the UI hook share the same typed CRUD. The generic helpers mean near-zero new SQL.

**Alternatives considered**: Per-feature data access inside `features/courses/data/` — rejected: would duplicate the spine and let a feature own persistence. Raw SQL in the sync layer — rejected: bypasses the zod-validated repository boundary.
