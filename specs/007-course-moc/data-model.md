# Data Model: Course Authoring & MOC Materialization

**Feature**: 007-course-moc | **Date**: 2026-05-28

This feature introduces **no new SQLite tables or columns**. It reuses the 003 entities and adds one new artifact type that lives in the vault (the Course MOC) plus its frontmatter schema. The SQLite entities below are documented as-is for reference; the MOC document model is the new contribution.

---

## Existing SQLite entities (reused, unchanged)

### Domain *(existing — domains.ts / domain.ts)*
| Field | Type | Notes |
|---|---|---|
| id | string (uuid) | PK |
| name | string | unique (case-insensitive in app) |
| color | string (hex) | from the fixed palette |

### Campaign *(existing model; gains a repository this feature — campaign.ts)*
| Field | Type | Notes |
|---|---|---|
| id | string (uuid) | PK |
| title | string | |
| domain_id | string | FK → domains.id |

### Course *(existing — course.ts; gains update/list/upsert functions)*
| Field | Type | Notes |
|---|---|---|
| id | string (uuid) | PK; **== MOC frontmatter `cic-id`** (the durable identity link) |
| title | string | authoritative both ways; ← MOC `title` on read-back |
| domain_id | string | FK → domains.id; required (FR-005) |
| campaign_id | string \| null | FK → campaigns.id; optional |
| moc_path | string \| null | vault-relative path to the MOC; set on first materialize, updated if a moved file is found on rescan |

### Milestone *(existing — milestone.ts; gains update/delete/sync functions)*
| Field | Type | Notes |
|---|---|---|
| id | string (uuid) | PK; **== the `id` in the MOC milestone line comment** |
| course_id | string | FK → courses.id |
| capability | string | the milestone's capability statement |
| status | enum | `todo` \| `in-progress` \| `done` (enums.ts) |
| order_index | int | position within the course; from MOC line order on read-back |

**Relationships**: Domain 1—N Campaign; Domain 1—N Course; Campaign 1—N Course (optional); Course 1—N Milestone. Deleting a Course removes its row and its Milestones (existing FK cascade) but **never** its MOC file.

---

## New artifact: the Course MOC (vault Markdown file)

Not a SQLite entity — a Markdown file the app owns the *managed sections* of. One MOC per Course, at `course.moc_path` (default `Courses/<Title>.md`).

### MOC frontmatter — `MocCourseFrontmatterSchema` (zod, new in `features/courses/moc/frontmatter.ts`)

```ts
{
  "cic-type": z.literal("course"),   // discriminator (R6)
  "cic-id": z.string(),              // == course.id
  title: z.string(),
  domain: z.string(),                // domain NAME (resolved to id on read-back)
  campaign: z.string().nullable(),   // campaign TITLE or null
}
```

- **Validation**: `readNoteAs(path, MocCourseFrontmatterSchema)` both discriminates (non-course files fail `cic-type`) and validates shape. A file failing this schema is not a CIC Course MOC and is skipped.
- **Identity**: `cic-id` is the stable key; survives rename/move. `title`/`domain`/`campaign` are human-editable and authoritative for the app on read-back (with domain/campaign resolved/created by name — R7).

### MOC body — managed sections (R2)

Canonical order: `capability`, `milestones`, `resources`, `projects`, `sessions`, `notes`. Each delimited by `<!-- cic:<name> -->` … `<!-- /cic:<name> -->`. This feature populates `capability` and `milestones`; the rest are written as empty marker pairs. `## Reflections` and any out-of-marker content are user-owned (never written).

| Section | Content this feature writes | Read-back authority |
|---|---|---|
| capability | the Course's one-paragraph capability statement | → `course` (capability is carried in the MOC, not a SQLite column today — see note) |
| milestones | one task-list line per Milestone (R3) | → Milestones (upsert by id, delete-missing) |
| resources / projects / sessions / notes | empty marker pairs (skeleton) | ignored by this feature |

> **Note on Capability storage**: The Course SQLite row has no `capability` column today. For this feature the capability paragraph is **authored in-app and persisted in the MOC** (the vault is canonical for knowledge text), and held in component state for the editing session. The app does not need a SQLite mirror of it to satisfy any 007 requirement (it is rendered into the MOC on write and read from the MOC on rescan). If a later feature needs to query capability without reading the vault, a column can be added then — out of scope here (Constitution: no schema we don't yet consume).

### MOC milestone line (R3)

```
- [ ] <capability> <!-- cic:m id=<uuid> status=todo -->
- [/] <capability> <!-- cic:m id=<uuid> status=in-progress -->
- [x] <capability> <!-- cic:m id=<uuid> status=done -->
```

Authoritative parse fields: `id`, `status` (from the comment), `capability` (text before the comment), `order_index` (line position). A line inside the milestones block lacking a valid comment → treated as a user-added milestone (new id, status from checkbox).

---

## The render/merge/parse model — `MocModel` (`features/courses/moc/model.ts`)

The single input shape the pure MOC functions consume/produce, decoupling them from SQLite row types:

```ts
interface MocMilestoneModel { id: string; capability: string; status: MilestoneStatus; }
interface MocModel {
  id: string;                 // course.id
  title: string;
  domain: string;             // name
  campaign: string | null;    // title
  capability: string;         // paragraph (may be empty)
  milestones: MocMilestoneModel[];  // already ordered
}
```

- `buildFrontmatter(model)` → the frontmatter object (validates against `MocCourseFrontmatterSchema`).
- `renderMocBody(model)` → full templated body (fresh file).
- `mergeMocBody(existingBody, model)` → body with managed sections replaced, user regions preserved.
- `parseMocBody(body)` → `{ capability: string; milestones: MocMilestoneModel[] }` or a `MocParseError`.

**State transitions (Milestone, on read-back sync)**: file present + id known → update (capability/status/order). file present + id unknown → insert. id known + absent from file → delete. Mirrors R7's upsert-by-id / delete-missing.
