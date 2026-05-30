# Data Model: Projects — Applied Practice (MVP)

Phase 1 data design for Feature 015. Most of this schema **already exists** (shipped in `m0001_initial`, v1); the only DB change is the `m0008` delta. Two stores are involved: **SQLite** (tracking/integration) and the **Obsidian vault** (canonical Markdown for each Project).

---

## 1. SQLite — existing schema (from v1, unchanged)

```sql
projects (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  capability   TEXT NOT NULL,                 -- one-sentence "what completing this proves"
  status       TEXT NOT NULL DEFAULT 'open'   -- CHECK (open|in-progress|complete|abandoned)
               CHECK (status IN (...)),
  opened_at    TEXT NOT NULL,
  closed_at    TEXT,                           -- null until closed
  project_path TEXT,                           -- vault-relative path to the .md (null until materialized)
  template     TEXT                            -- chosen seed template name, reference only
)

project_milestones (                           -- M:N, 1..N milestones a Project exercises
  project_id   TEXT NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, milestone_id)
)

project_resources (                            -- M:N, optional; targeted reference material
  project_id  TEXT NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  locator     TEXT,                            -- free-form (e.g. "Ch.3 §2")
  PRIMARY KEY (project_id, resource_id)
)

sessions ( … project_id TEXT REFERENCES projects(id) ON DELETE SET NULL … )  -- nullable, from v1
cards    ( … project_id TEXT REFERENCES projects(id) ON DELETE SET NULL … )  -- nullable, from v1
```

Existing indexes (v1): `idx_projects_course_id`, `idx_project_milestones_milestone_id`, `idx_project_resources_resource_id`.

**FK delete semantics (already correct for our needs):**
- Deleting a **Course** cascades to its Projects (and their join rows). Expected — a Project belongs to exactly one Course.
- Deleting a **Milestone** or **Resource** cascades the *join row only* (the Project survives) — satisfies spec FR-020 ("dangling reference dropped, Project survives").
- Deleting a **Project** sets `sessions.project_id` / `cards.project_id` back to `NULL` (work-block sessions and spawned cards survive, just unlinked) — the right neutral behavior.

---

## 2. SQLite — the `m0008_project_authoring` delta (schema 7 → 8)

```sql
ALTER TABLE projects ADD COLUMN title TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_cards_project_id    ON cards(project_id);
```

- **`title`** — short human label (distinct from the `capability` sentence). Required by the form/repo; the `DEFAULT ''` is a DDL formality (the table has zero rows; the app never writes an empty title). See research R1.
- **indexes** — support the dashboard "active Projects" read and "sessions touching a Project" lookups. `idx_projects_course_id` already exists.

**Model change** — `src/db/models/project.ts` `ProjectSchema` gains `title: z.string()` (non-empty enforced at the repo/form boundary).

**Version-pinned test bumps (7 → 8):** `migrate.test.ts`, `migrate.evolution.test.ts`, `migrate.lossless.test.ts`, `settings.test.ts`.

---

## 3. Status lifecycle

```
            plan/complete a session against it  ┌───────────────┐
  open ───────────────────────────────────────▶ │  in-progress  │
   │            (or manual "mark in-progress")    └──────┬────────┘
   │                                                     │
   │  close (directly allowed from open)                 │ close
   ▼                                                     ▼
 complete  ◀──────────────────────────────────────────  complete
 abandoned ◀──────────────────────────────────────────  abandoned
```

- **`open`** — created, not yet touched.
- **`in-progress`** — ≥1 session planned/done against it, or learner advanced manually. Transition is idempotent.
- **`complete`** — closed claiming the capability. Records `closed_at`; reflection captured (R3); optional cards spawned (R4).
- **`abandoned`** — closed without the claim. Neutral, not failure. Records `closed_at`.
- Closing directly from `open` is allowed (spec edge case). **No transition is automated** — every move is learner-driven (Constitution III). Reopening a closed Project is out of MVP scope.

**Active** = `open` ∪ `in-progress` (the dashboard/active queries).

---

## 4. Vault — the Project Markdown file (canonical)

### Frontmatter (app-managed, zod-validated on read)

```yaml
---
cic-type: project          # discriminator for rescan
cic-id: <project.id>        # durable identity (upsert key)
course-id: <course.id>      # STABLE course link — rescan resolves the Course by this (machine field)
title: <title>
course: <course title>      # human-readable label for the reader only (NOT used to resolve the link)
capability: <one sentence>
status: open                # open|in-progress|complete|abandoned
milestones: [<id>, ...]     # 1..N milestone ids this Project exercises (machine field)
opened: 2026-05-29
closed: 2026-06-02          # omitted while open/in-progress
template: math/proof        # omitted if none chosen
---
```

`ProjectFrontmatterSchema` (zod): `cic-type` literal `project`, `cic-id` string, `course-id` string, `title` non-empty, `capability` non-empty, `status` enum, `milestones` array of strings (default `[]`), `opened` string, `closed` optional, `template` optional, `course` string (display only). Lenient where safe (missing `closed`/`template` → omitted); a malformed file fails the schema and is **skipped** on rescan, never crashes (Constitution code conventions).

**Course-link key (M2 remediation).** Rescan resolves a Project's Course by the **`course-id`** machine field (the Course's durable `cic-id`), never by the human `course` title — titles can collide or be renamed, so they are display-only. This mirrors how the MOC round-trips its own identity by `cic-id`. A file whose `course-id` matches no Course in the active vault is skipped (MVP: a Project's Course must already exist).

**Framing destination (M1 remediation).** The optional opening problem framing is **not** a stored column and **not** a frontmatter field; it is woven once into the rendered body's `## Problem` section at creation (then learner-owned, never re-written). It flows form → `useProjects.create` → the creation render — see [contracts/project-document.md](./contracts/project-document.md).

### Body (learner-owned, freeform — app writes once at creation, then never)

Seeded from the chosen template (R9). Example `freeform`:

```markdown
## Problem
<!-- what concrete problem are you solving? -->

## Approach
<!-- how will you tackle it? which milestones' capability applies? -->

## Work
<!-- the actual work: prose, code, proofs, diagrams, links -->

## Reflection
<!-- what did you learn? what was hard? what would you do differently? -->
```

On **close**, an additive block is appended (R3) — never overwriting existing body:

```markdown
## Reflection (closed 2026-06-02)
<learner's reflection prose from the close dialog>
```

**Marker contract**: unlike the MOC, there are **no app-managed body sections**. The only app-managed surface is the frontmatter block. `merge.ts` replaces the frontmatter and preserves the body byte-for-byte (plus the one-time reflection append at close).

---

## 5. Entities & relationships (summary)

| Entity | Store | Key fields | Relationships |
|---|---|---|---|
| **Project** | SQLite `projects` + vault `.md` | id, course_id, title, capability, status, opened_at, closed_at, project_path, template | belongs to exactly one Course (FK, cascade); has 1..N Milestones; has 0..N Resources |
| **Project ↔ Milestone** | `project_milestones` | (project_id, milestone_id) | M:N; restricted in-app to the Project's Course's milestones; cascade-drops the link on either side's delete |
| **Project ↔ Resource** | `project_resources` | (project_id, resource_id, locator) | M:N, optional; cascade-drops the link |
| **Session ↔ Project** | `sessions.project_id` | nullable FK | a session may be a Project work block; SET NULL on Project delete |
| **Card ↔ Project** | `cards.project_id` | nullable FK | a card may be spawned from a Project close-reflection; SET NULL on Project delete |
| **Project template** | (none — pure code) | name only (in `template`) | one of `math/proof`/`cs/implement`/`freeform`; reference only, never a validator |

---

## 6. Validation rules (from spec requirements)

- **FR-001/FR-002**: create requires `title` (non-empty), `capability` (non-empty), and ≥1 Milestone of the **same Course** (enforced in the repo + form; the FK only guarantees a valid milestone id, the same-Course constraint is in-app — same approach as `sessions.milestone_id` in 013). **The ≥1 rule is a create/save-time invariant only** (M3): because `project_milestones.milestone_id` is `ON DELETE CASCADE`, deleting a Milestone drops the join row and a Project can legitimately end up with **zero** Milestones. That post-deletion state is tolerated — the Project survives (FR-020) and read/edit/display/render paths MUST NOT assume ≥1 (re-require ≥1 only when the learner saves an edit). Covered by a deletion-survival test.
- **FR-005**: frontmatter validated via zod on read; malformed → skip, never crash.
- **FR-008/FR-013**: status is learner-driven only; no auto-`complete`; no grading field exists anywhere.
- **FR-012**: spawned cards always go through `createCard` (manual front/back), tagged `project_id`; never auto-created.
- **FR-016/FR-018**: delete removes rows (cascade) + offers detach (strip `cic-type`/`cic-id`, keep file) or deleteFile (sanctioned `deleteNote`, confirmed; "delete anyway" on drift).
- **FR-017**: all reads scoped to the active vault transitively (project → course → domain → vault).
