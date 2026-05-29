# Data Model — Course Session Planner (Feature 013)

**One additive migration (`m0007_session_curriculum`), schema 6 → 7.** It adds two columns to the existing `sessions` table (from `m0001` + `m0006`). No new tables; coverage/progress are derived.

---

## Migration `m0007_session_curriculum`

```sql
ALTER TABLE sessions ADD COLUMN milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_sessions_milestone_id ON sessions(milestone_id);
```

- `ADD COLUMN` is idempotent under the runner (`columnExists` guard + the Feature-012 "duplicate column name" self-heal), so a partial apply on the pooled adapter recovers on next launch.
- `milestone_id` — nullable; `ON DELETE SET NULL` so deleting a Milestone unmaps (never deletes) its sessions (R3).
- `order_index` — `NOT NULL DEFAULT 0`; pre-feature rows back-fill to 0 and sort by the `(order_index, date, id)` tiebreak until reordered (R2).
- IMMUTABLE once shipped.

**Version-pinned migration tests** bump to v7: `migrate.test.ts` (0 → 7, applied 7, `user_version` 7 — table count unchanged at 20, this migration adds only columns + an index), `migrate.evolution.test.ts` (`first.applied` 7; second `{from:7,to:7,applied:0}`; probe `version: 8`), `migrate.lossless.test.ts` (probe `version: 8`).

---

## Entity: `sessions` (existing table + 2 new columns)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid |
| `course_id` | TEXT NOT NULL → `courses(id)` CASCADE | the session's Course (vault-scope anchor) |
| `project_id` | TEXT → `projects(id)` SET NULL | unused in v1 |
| `date` | TEXT NOT NULL | planned/creation time (012); also the ordering tiebreak |
| `objective` | TEXT | capability objective |
| `minutes` | INTEGER NOT NULL DEFAULT 0 | doing minutes (012) |
| `did_retrieval` | INTEGER NOT NULL DEFAULT 0 | boolean (012) |
| `writeup_path` | TEXT | set on completion (012) |
| `status` | TEXT NOT NULL DEFAULT 'planned' CHECK ∈ {planned, completed} | lifecycle (012/m0006) |
| `completed_at` | TEXT | completion time (012/m0006) |
| **`milestone_id`** | TEXT → `milestones(id)` ON DELETE SET NULL | **NEW** — the Milestone this session advances (optional). Restricted to the Course's own Milestones in-app (R3) |
| **`order_index`** | INTEGER NOT NULL DEFAULT 0 | **NEW** — position within the Course's sequence (R2) |

No `vault_id` (transitive via `course → domain.vault_id`).

---

## Model

`Session` (`models/session.ts`) — **add**:
- `milestone_id: z.string().nullable()`
- `order_index: z.number().int()`

(Everything else unchanged from Feature 012.)

---

## Relationships

```text
courses (domain_id)
  ├─ milestones (course_id)        ← session.milestone_id → milestones (SET NULL)
  └─ sessions  (course_id, order_index, milestone_id?)
       ├─ session_assignments, pretest_responses, session_card_drafts (012)
```

---

## Ordering invariant (R2)

For a given `course_id`, after any `reorderCourseSessions`, the set of `order_index` values is exactly `0..N-1` (one per session, no duplicates). Between a migration/back-fill and the first reorder, rows may share `order_index = 0`; listing always sorts by `(order_index, date, id)` so the display is deterministic regardless.

`planSession` appends: `order_index = COALESCE(MAX(order_index), -1) + 1` for the Course (R5).

---

## Derived read-models (not stored — computed in `useCoursePlans`, R4)

From `listCourseSessions(courseId)` (ordered) + `listMilestonesByCourse(courseId)`:

- **Coverage**: for each Milestone, `count(sessions where milestone_id = m.id)`; a Milestone with 0 is **uncovered**. Sessions with `milestone_id = null` are an **"unassigned"** bucket.
- **Progress**: `completed = count(status='completed')`, `total = count(*)` → `done / total` (no mastery state — FR-012).

---

## Validation rules

- **Milestone association**: `milestone_id`, when set, MUST be a Milestone of the session's Course (FR-010, app-validated); may be null (FR-007).
- **Order**: `order_index` is managed by the repo (`planSession` append, `reorderCourseSessions` rewrite) — never free-entered by the user.
- All rows round-trip through `SessionSchema` on read (the two new fields included).

---

## Affected repo surface (see contracts/session-ordering.md)

- `planSession` — compute `order_index`; accept optional `milestoneId`.
- `listCourseSessions(db, courseId)` — all sessions for a Course, ordered `(order_index, date, id)`.
- `reorderCourseSessions(db, courseId, orderedIds)` — rewrite `order_index = position`, transactional.
- `setSessionMilestone(db, sessionId, milestoneId | null)` — set/clear the association.
- `deletePlannedSession` (012) — unchanged (planned only).
