# Data Model: SQLite Data Layer

**Feature**: 003-sqlite-data-layer · **Date**: 2026-05-27

The complete PRD §8 tracking schema. Conventions (research R5/R6):
- **PKs**: `id TEXT` = UUID (`crypto.randomUUID()`), except natural-key tables (`streaks.date`, `vault_writes.file_path`).
- **Timestamps**: ISO-8601 UTC text (`*_at`); date-only fields `YYYY-MM-DD` text (`date`).
- **Booleans**: `INTEGER` 0/1.
- **Enums**: `TEXT` + `CHECK(... IN (...))` in DDL **and** `z.enum` at the boundary.
- **JSON**: `TEXT` holding JSON, validated by a zod schema on read.
- **FKs**: enforced (sqlx defaults `foreign_keys` ON; test adapter sets it). `ON DELETE` per the cascade matrix below.

> **Knowledge vs. tracking (Constitution I).** `*_path` columns are string links to vault files, never content. `cards.front/back` are **SRS artifacts** (per PRD §8), not vault note bodies — legitimately in SQLite; the *note* a card derives from lives in the vault and is referenced via `cards.note_path`.

## Enumerations (single source: `src/db/models/enums.ts`)

| Enum | Values |
|---|---|
| `milestone_status` | `todo` · `in-progress` · `done` |
| `project_status` | `open` · `in-progress` · `complete` · `abandoned` |
| `resource_kind` | `pdf` · `epub` · `markdown` · `video_file` · `video_url` · `web_page` · `book` · `audio` |
| `resource_role` | `primary` · `secondary` · `reference` |
| `assignment_kind` | `read` · `watch` · `listen` · `review` |
| `review_rating` | `again` · `hard` · `good` · `easy` |

## Tables

Listed in creation order (referenced tables first, so FKs are valid at `CREATE`).

### Core hierarchy

**`domains`** — top-level subject area
- `id TEXT PK` · `name TEXT NOT NULL UNIQUE` · `color TEXT NOT NULL`

**`campaigns`** — long-arc objective within a domain
- `id TEXT PK` · `title TEXT NOT NULL` · `domain_id TEXT NOT NULL → domains(id) ON DELETE CASCADE`

**`courses`** — the enrollable unit
- `id TEXT PK` · `title TEXT NOT NULL` · `domain_id TEXT NOT NULL → domains(id) ON DELETE CASCADE` · `campaign_id TEXT NULL → campaigns(id) ON DELETE SET NULL` · `moc_path TEXT NULL` (vault MOC link)

**`milestones`** — capability gate within a course
- `id TEXT PK` · `course_id TEXT NOT NULL → courses(id) ON DELETE CASCADE` · `capability TEXT NOT NULL` · `status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN milestone_status)` · `order_index INTEGER NOT NULL` (`order` is reserved)

### Projects (created before sessions/cards, which reference it)

**`projects`** — applied-practice artifact (F11)
- `id TEXT PK` · `course_id TEXT NOT NULL → courses(id) ON DELETE CASCADE` · `capability TEXT NOT NULL` · `status TEXT NOT NULL DEFAULT 'open' CHECK(status IN project_status)` · `opened_at TEXT NOT NULL` · `closed_at TEXT NULL` · `project_path TEXT NULL` · `template TEXT NULL`

### Sessions & SRS

**`sessions`** — one Daily-Loop run
- `id TEXT PK` · `course_id TEXT NOT NULL → courses(id) ON DELETE CASCADE` · `project_id TEXT NULL → projects(id) ON DELETE SET NULL` · `date TEXT NOT NULL` · `objective TEXT NULL` · `minutes INTEGER NOT NULL DEFAULT 0` · `did_retrieval INTEGER NOT NULL DEFAULT 0` (bool) · `writeup_path TEXT NULL`

**`cards`** — SRS flashcard
- `id TEXT PK` · `course_id TEXT NOT NULL → courses(id) ON DELETE CASCADE` · `project_id TEXT NULL → projects(id) ON DELETE SET NULL` · `note_path TEXT NULL` · `front TEXT NOT NULL` · `back TEXT NOT NULL` · `fsrs_state TEXT NULL` (JSON, opaque to 003) · `due_at TEXT NULL` · `last_reviewed TEXT NULL` · `created_at TEXT NOT NULL`
  - *Note:* `created_at` is a **deliberate addition beyond a strict PRD §8 reading** — it gives cards a stable creation timestamp for deterministic ordering and audit. It is tracking metadata, never knowledge (Constitution I). Flagged so a future PRD reconciliation knows it originated here.

**`reviews`** — one rating event on a card
- `id TEXT PK` · `card_id TEXT NOT NULL → cards(id) ON DELETE CASCADE` · `rating TEXT NOT NULL CHECK(rating IN review_rating)` · `confidence INTEGER NULL CHECK(confidence BETWEEN 1 AND 5)` **(no default — Constitution III / F3.5)** · `reviewed_at TEXT NOT NULL` · `elapsed_ms INTEGER NULL`

**`streaks`** — per-day activity
- `date TEXT PK` (`YYYY-MM-DD`) · `minutes INTEGER NOT NULL DEFAULT 0` · `domains_touched TEXT NOT NULL DEFAULT '[]'` (JSON `string[]` of domain ids)

**`pretest_responses`** — errorful-generation capture (F2.5)
- `id TEXT PK` · `session_id TEXT NOT NULL → sessions(id) ON DELETE CASCADE` · `question TEXT NOT NULL` · `user_response TEXT NULL` · `revealed_after INTEGER NOT NULL DEFAULT 0` (bool)

### Resources (first-class) + links

**`resources`** — studied reference material
- `id TEXT PK` · `title TEXT NOT NULL` · `kind TEXT NOT NULL CHECK(kind IN resource_kind)` · `file_path TEXT NULL` · `url TEXT NULL` · `metadata TEXT NOT NULL DEFAULT '{}'` (JSON object, kind-specific) · `ingested_at TEXT NULL` (non-null only once AI-ingested) · `added_at TEXT NOT NULL`

**`course_resources`** — M:N course↔resource
- `course_id TEXT NOT NULL → courses(id) ON DELETE CASCADE` · `resource_id TEXT NOT NULL → resources(id) ON DELETE CASCADE` · `role TEXT NOT NULL CHECK(role IN resource_role)` · **PK (course_id, resource_id)**

**`session_assignments`** — what to study this session
- `id TEXT PK` · `session_id TEXT NOT NULL → sessions(id) ON DELETE CASCADE` · `resource_id TEXT NOT NULL → resources(id) ON DELETE CASCADE` · `locator TEXT NULL` · `assignment_kind TEXT NOT NULL CHECK(assignment_kind IN assignment_kind)`

**`card_resources`** — M:N card↔resource citation
- `card_id TEXT NOT NULL → cards(id) ON DELETE CASCADE` · `resource_id TEXT NOT NULL → resources(id) ON DELETE CASCADE` · `locator TEXT NULL` · **PK (card_id, resource_id)**

### Projects M:N + integrity

**`project_milestones`** — M:N project↔milestone
- `project_id TEXT NOT NULL → projects(id) ON DELETE CASCADE` · `milestone_id TEXT NOT NULL → milestones(id) ON DELETE CASCADE` · **PK (project_id, milestone_id)**

**`project_resources`** — M:N project↔resource (optional)
- `project_id TEXT NOT NULL → projects(id) ON DELETE CASCADE` · `resource_id TEXT NOT NULL → resources(id) ON DELETE CASCADE` · `locator TEXT NULL` · **PK (project_id, resource_id)**

**`vault_writes`** — external-edit detection (§13 conflict UX)
- `file_path TEXT PK` · `app_mtime TEXT NOT NULL` · `app_hash TEXT NOT NULL`

## Cascade matrix (`ON DELETE`)

| Parent removed | Effect |
|---|---|
| Domain | CASCADE → campaigns, courses (→ milestones, projects, sessions, cards, reviews, …) |
| Course | CASCADE → milestones, projects, sessions, cards (→ reviews, *_resources join rows, assignments); `course_resources` rows removed, **resources kept** |
| Project | CASCADE → `project_milestones`, `project_resources`; `sessions.project_id` / `cards.project_id` **SET NULL** (the session/card survives) |
| Session | CASCADE → `pretest_responses`, `session_assignments` |
| Card | CASCADE → `reviews`, `card_resources` |
| Resource | CASCADE → its join rows in `course_resources` / `session_assignments` / `card_resources` / `project_resources` (the link only) |

**Principle**: owned children cascade; shared entities (resources) are never deleted by unlinking — only the join row is.

## JSON column shapes (validated on read)

| Column | zod shape (003) | Owner |
|---|---|---|
| `cards.fsrs_state` | parseable JSON object, otherwise opaque (`z.record(z.unknown())`) | SRS feature defines the real shape |
| `resources.metadata` | JSON object (`z.record(z.unknown())`); kind-specific keys validated later | Resource feature |
| `streaks.domains_touched` | `z.array(z.string())` (domain ids) | this feature |

## Indexes (created with the schema)

FK columns used for lookups: `campaigns.domain_id`, `courses.domain_id`, `milestones.course_id`, `sessions.course_id`, `cards.course_id`, `cards.due_at` (review queue), `reviews.card_id`, `resources.kind`, and the reverse side of each join table (`*_resources.resource_id`).

## Validation rules (zod, at the boundary)

- Every row read from SQLite is parsed through its entity's zod schema before reaching a feature — raw rows are never trusted (Constitution code conventions).
- Enums use `z.enum([...])` from `enums.ts` (mirrors the DDL `CHECK`).
- Booleans: integer 0/1 ⇄ boolean via a zod transform.
- JSON columns: `z.string()` → `JSON.parse` → shape schema; parse failure is a rejected read with a clear error (never a crash — Constitution: never crash on malformed data).
- `confidence`: `z.number().int().min(1).max(5).nullable()` with **no default**.
- Writes validate the input model *before* the SQL statement runs (R7), so invalid data never reaches the DB.

## State transitions (recorded, not enforced here)

`milestone.status` (todo→in-progress→done) and `project.status` (open→in-progress→complete|abandoned) are stored values. 003 enforces only that the value is in-range; the *rules* for when a transition is allowed belong to the features that own those workflows. No status is auto-advanced (Constitution III).

## Not in this feature

`chunks` / `resource_map` (vector store — RAG feature), the `CourseBlueprint` IR (a transient TS type — generation feature), and any FSRS scheduling computation (SRS feature). The schema leaves the seams (`cards.fsrs_state`, `resources.ingested_at`) ready for them.
