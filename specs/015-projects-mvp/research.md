# Research: Projects — Applied Practice (MVP)

Phase 0 decisions for Feature 015. Each entry: **Decision · Rationale · Alternatives rejected**. Grounded in the existing codebase (verified by reading the migrations, the 007 MOC/sync modules, the 010/012 card path, and the 008 dashboard) and PRD §F11 / §8 / §12.

---

## R1 — Migration delta: add only `projects.title` + two `project_id` indexes (schema 7 → 8)

**Decision**: Ship a tiny additive migration `m0008_project_authoring`:
```sql
ALTER TABLE projects ADD COLUMN title TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_cards_project_id ON cards(project_id);
```
Mirror m0007's style exactly (the runner's `columnExists` guard + the Feature-012 "duplicate column name" self-heal make `ADD COLUMN` safe under the pooled adapter; `IF NOT EXISTS` covers the indexes). Bump the four version-pinned tests 7 → 8: `migrate.test.ts:30`, `migrate.evolution.test.ts:19/22/30`, `migrate.lossless.test.ts:17/23`, `settings.test.ts:11`.

**Rationale**: The whole Projects schema (`projects`, `project_milestones`, `project_resources`, nullable `sessions.project_id` / `cards.project_id`, plus `idx_projects_course_id`, `idx_project_milestones_milestone_id`, `idx_project_resources_resource_id`) already shipped in `m0001_initial` (v1). The only gaps are: (a) no `title` column — the existing `projects` table has `capability` (a sentence) but no short human label; and (b) no index on the `project_id` FKs (the dashboard "active projects" and "sessions touching a project" reads benefit). `NOT NULL DEFAULT ''` is harmless: the table has zero rows today, the default never materializes (the repo + form always supply a non-empty title), and it preserves the same not-null contract `courses.title` has.

**Alternatives rejected**:
- *No migration; derive the label from `capability` or the filename.* — Conflates two distinct concepts (a label vs. a capability claim) and forces the DB-only dashboard read-model to either show a long sentence or read every vault file (an N+1 of file IO on the landing screen). A 1-column additive migration is far cheaper than that coupling.
- *Add `title` as nullable.* — Loses the not-null guarantee `courses.title` enjoys; the form requires it anyway, so nullable would just invite defensive null-handling everywhere it's read.
- *Rebuild the `projects` table to insert `title` in a "nicer" position.* — A table rebuild under FK-on + the pooled runner is exactly the risk Feature 009 R3/R8 flagged and declined. `ADD COLUMN` is the safe, idempotent path.

---

## R2 — The Project document module mirrors 007's MOC module, but the body is **learner-owned**

**Decision**: Build `src/features/projects/doc/` as a pure module (no IO) mirroring `src/features/courses/moc/`: `markers.ts`, `model.ts`, `frontmatter.ts` (zod), `templates.ts`, `render.ts`, `parse.ts`, `merge.ts`, `filename.ts`, `index.ts`. **Critical inversion vs. the MOC**: a Course MOC re-renders its app-managed body sections on every `materializeCourse`; a Project's body is the learner's workspace, so the app renders it **once** from a template at creation and thereafter only ever rewrites the **frontmatter**. `merge.ts` therefore implements *"replace the frontmatter block, keep the body verbatim"* (plus an `appendReflection` helper for close — see R3). There are **no app-managed body sections** to reconcile.

**Rationale**: Constitution I demands "never clobber" and "user-edited regions are never overwritten." For a Project the *entire body* is a user-edited region (Problem · Approach · Work · Reflection — diagrams, code, proofs, prose). Making the body fully learner-owned is both the strongest possible compliance and *simpler* than the MOC's marker-scoped section merge: the app's only managed surface is the small fixed frontmatter (the integration layer the spec calls out). Reusing the 007 file layout keeps the mental model and test patterns consistent (the round-trip is Vitest-tested against a node temp vault exactly as 007 is).

**Alternatives rejected**:
- *Marker-delimited managed body sections (full MOC parity).* — Unnecessary complexity: Projects have no app-owned body content to keep in sync. The MOC needs it because milestones/resources/sessions are app-derived lists rendered into the body; a Project's body is purely the learner's work.
- *Store the body in SQLite and treat the vault file as an export.* — Violates Constitution I (vault is canonical, not a projection). The file must be the source of truth a person edits in Obsidian.

---

## R3 — Reflection on close is an additive, user-authored body append

**Decision**: Closing a Project (`complete`/`abandoned`) (1) updates frontmatter `status` + `closed` via the frontmatter-swap merge, and (2) if the learner wrote reflection prose in the close dialog, appends it once under a `## Reflection (closed YYYY-MM-DD)` heading at the end of the body. The reflection prose is content the learner authored in the dialog; the append is purely additive and never overwrites existing body content.

**Rationale**: The reflection is valuable to persist in the canonical store (it's the learner's own writing and the grounding for future Feynman targeting in F4). An append is the minimal body mutation that honors "never clobber" — nothing existing is touched. Keeping it to a single append (not a managed, re-renderable section) avoids body-merge complexity and keeps the file clean.

**Alternatives rejected**:
- *Persist the reflection only in SQLite.* — Splits the learner's writing away from their canonical file; the reflection belongs in the vault next to the work.
- *Render a managed `## Reflection` section the app re-writes.* — Reintroduces the body-merge problem R2 deliberately avoided, for no benefit (the reflection is written once at close).
- *Don't persist the reflection at all (use it only to seed cards).* — Throws away durable learner value; the close dialog's prose would vanish.

---

## R4 — Card-spawn on close reuses `createCard`, extended with an optional `projectId`; always manual

**Decision**: Extend `createCard(db, { courseId, front, back, notePath? })` with an optional `projectId`. The `CloseProjectDialog` presents editable front/back rows (seeded empty, framed by "what did you have to look up? what was hard?") that the learner explicitly fills and confirms; on confirm, each row becomes a `createCard({ courseId: project.course_id, front, back, projectId })`. Optionally cite the Project's resources via `addCardResource` (mirroring the session path). Never auto-generate, never auto-schedule beyond normal new-card behavior (new cards are due immediately, throttled by the existing daily-new cap — unchanged).

**Rationale**: Constitution III — a card is "learned" only through engagement, and AI/automation never auto-commits cards. The 012 `finalizeSession` already materializes user-authored card drafts into real cards; the close-reflection spawn is the same shape (user-authored front/back → `createCard`), just sourced from the dialog and tagged with `project_id`. Reusing `createCard` (the single card-creation chokepoint) keeps FSRS-state initialization and the schema in one place.

**Alternatives rejected**:
- *Reuse `session_card_drafts` + `finalizeSession`'s draft loop verbatim.* — That path is session-scoped (drafts staged at plan time, deduped by session assignment). A Project close has no session drafts; threading it through sessions would be a contortion. The shared primitive worth reusing is `createCard`, not the draft table.
- *Auto-suggest card fronts from the reflection text.* — That's AI (deferred to Phase 3.5) and would brush Constitution III. MVP is manual authoring only.

---

## R5 — Session↔Project link is set at plan time and flips `open → in-progress`

**Decision**: `planSession` gains an optional `projectId`; `SessionPlanner` offers an optional Project picker listing the Course's `open`/`in-progress` Projects. When a session is planned (or completed) against a Project whose status is `open`, the Project transitions to `in-progress` (idempotent — already-`in-progress`/closed Projects are untouched). A manual "mark in-progress" affordance is also available on the Project.

**Rationale**: Spec FR-009/FR-010: a Project becomes `in-progress` "when work first touches it (e.g. a Daily-Loop session is planned against it) or when the learner advances it manually." Planning a session against a Project is the clearest "touch" signal and requires no new loop step. Flipping on plan (not only on completion) matches the spec's wording and gives immediate feedback. The two-phase session model (012/013) already carries `project_id` in the schema — this just wires it.

**Alternatives rejected**:
- *Flip to `in-progress` only when the session is completed.* — Delays the status change and leaves a planned-but-not-done Project looking untouched; contradicts the spec's "planned against it" example.
- *A dedicated "start project" wizard.* — Over-engineered for MVP; manual advance + the session link cover it.

---

## R6 — Dashboard active-Projects-per-Domain stays DB-only and additive

**Decision**: Extend `getDashboardSummary` (or add a sibling read in the same load) to count active (`open`/`in-progress`) Projects per Domain via a single grouped query joining `projects → courses → domains` filtered to the active vault; surface it in `DashboardView` as a per-Domain count/list alongside the existing allocation tiles, linking to the Course/Project. Show nothing when there are none (no fabricated entries — Constitution III, matching the 008 "no populated heatmap" discipline).

**Rationale**: Feature 008 established the dashboard as a real-data, DB-only aggregate (no vault IO, no N+1). Active-Projects-per-Domain is one more `GROUP BY` joined through the same Domain anchor. The `title` column (R1) is what lets this stay vault-free. Keeping it additive avoids disturbing the existing tiles.

**Alternatives rejected**:
- *Read project files from the vault to populate the dashboard.* — File IO on the landing screen; defeats the DB-only read-model and would be slow/fragile.
- *A separate Projects route/screen.* — Out of MVP scope; the Course-detail Projects section + a dashboard count is enough visibility for v1.

---

## R7 — Vault scoping is transitive (no `projects.vault_id`)

**Decision**: Projects inherit their vault through `project → course → domain → vault`. All list/active queries join through to the active vault id (`useActiveVaultId()`), exactly like courses/sessions/cards. No `vault_id` column on `projects`.

**Rationale**: Feature 009 made the Domain the scope anchor — everything under it (Courses, Milestones, Sessions, Cards) inherits the vault transitively. A Project belongs to exactly one Course (single-Course is locked, PRD F11.5), so it inherits cleanly. Adding a redundant `projects.vault_id` would duplicate the anchor and risk drift. (Resources carry their own `vault_id` only because they're *parallel* to the Domain hierarchy — a Project is not.)

**Alternatives rejected**:
- *Add `projects.vault_id`.* — Redundant with the transitive anchor; invites inconsistency between a Project's vault and its Course's vault.

---

## R8 — Rescan discriminates by `cic-type: project`, upserts by `cic-id` (mirrors 007)

**Decision**: `rescanProjects` lists vault `.md` files, validates frontmatter against `ProjectFrontmatterSchema` (discriminator `cic-type: project`), and upserts the Project by its durable `cic-id` — importing unknown CIC Projects and reflecting external edits to the frontmatter (capability, status, milestone refs). Malformed frontmatter → skip with a note, never crash. Vault-read-only (never writes/deletes during rescan). The known 007 follow-up applies: a rescan-imported file has no write-log fingerprint, so its first in-app frontmatter write surfaces an `unmanaged` drift the learner resolves with "reapply".

**Rationale**: This is the exact, proven 007 course-rescan shape (discriminate-by-type, upsert-by-id, import-unknown, skip-malformed, idempotent). Reusing it keeps the round-trip behavior and its edge cases consistent and already-understood. Milestone references in frontmatter are resolved to `project_milestones` rows by id (the ids are a machine field, like `cic-id`).

**Alternatives rejected**:
- *Match Project files by folder/filename convention instead of frontmatter type.* — Fragile; the frontmatter discriminator is the canonical signal (and the same one the MOC rescan uses).
- *Reconcile the freeform body on rescan.* — The body is learner-owned (R2); rescan only reads frontmatter for the integration layer.

---

## R9 — Three seed templates are pure body-string builders; never validators

**Decision**: `templates.ts` exports three starting bodies — `math/proof`, `cs/implement`, `freeform` — as pure functions returning the initial Markdown body (suggested `## Problem` · `## Approach` · `## Work` · `## Reflection` headings, shaped per domain). The chosen template is recorded in frontmatter `template` for reference only. Templates shape the *initial* body at creation and are **never** enforced thereafter — a Project whose body diverges is fully valid (no parse/validation against the template).

**Rationale**: PRD F11.2 — the non-conform format is the key design choice: mandatory frontmatter (validated) + freeform body (domain-shaped, not validated). Templates are conveniences, not schemas. Keeping them as pure string builders makes them trivially unit-testable and keeps the "templates aren't validators" guarantee structural (there's simply no code path that validates a body against a template).

**Alternatives rejected**:
- *Ship template files in the vault the app reads.* — PRD notes users *may* add their own template files outside the app, but in-app template management is out of scope for MVP; three built-in pure builders are the minimal shippable set.
- *Validate the body against the chosen template.* — Directly violates F11.2 ("no auto-format enforcement beyond the wrapper").

---

## Resolved unknowns

| Spec deferral | Resolution |
|---|---|
| Migration shape | R1 — `m0008`: `projects.title` + two `project_id` indexes (schema already mostly present from v1). |
| Project Markdown document module | R2 — pure `doc/` module mirroring 007's MOC, body learner-owned (frontmatter-only managed). |
| How session↔project link surfaces at plan time | R5 — optional `projectId` on `planSession` + a Project picker in `SessionPlanner`; flips `open → in-progress`. |
| How close-reflection reuses the 012 card-draft path | R4 — reuse `createCard` (extended with `projectId`), not the session-scoped draft table; manual rows in the close dialog. |
| Vault file placement | `Projects/` subfolder, slugged filename (mirrors `Courses/`), via `filename.ts`. |
| Reflection persistence | R3 — additive `## Reflection (closed …)` body append. |
