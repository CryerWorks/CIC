# Data Model — The Daily Loop (Feature 012, two-phase)

**One additive migration (`m0006_session_lifecycle`), schema 5 → 6.** It adds `sessions.status` + `sessions.completed_at` and a new `session_card_drafts` table. `session_assignments` and `pretest_responses` are unchanged (they pre-exist in `m0001`); they are now written at **plan** time and (for pretest answers) updated at **finish**.

---

## Migration `m0006_session_lifecycle`

```sql
ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'planned'
  CHECK (status IN ('planned', 'completed'));
ALTER TABLE sessions ADD COLUMN completed_at TEXT;

CREATE TABLE IF NOT EXISTS session_card_drafts (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  front       TEXT NOT NULL,
  back        TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_session_card_drafts_session_id ON session_card_drafts(session_id);
```

- `ADD COLUMN` is guarded idempotently by the runner (`columnExists`), safe under the pooled adapter (research R1).
- `DEFAULT 'planned'` is harmless for the (empty) existing table and makes a row "planned" until finish flips it.
- IMMUTABLE once shipped (migration contract rule 8).

**Version-pinned migration tests** bump to v6: `migrate.test.ts` (0 → 6, applied 6, `user_version` 6, **20 tables** — one more than 19), `migrate.evolution.test.ts` (`first.applied` 6; second `{from:6,to:6,applied:0}`; probe comments), `migrate.lossless.test.ts` (probe migration `version: 7`).

---

## Entities

### `sessions` (existing table + 2 new columns)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid |
| `course_id` | TEXT NOT NULL → `courses(id)` ON DELETE CASCADE | the session's Course; the vault-scope anchor (via `courses.domain_id → domains.vault_id`) |
| `project_id` | TEXT → `projects(id)` SET NULL | **unused in v1** — always null |
| `date` | TEXT NOT NULL | ISO timestamp the session was **planned** (creation) |
| `objective` | TEXT (nullable in schema; **required by the app**) | capability-phrased objective (seedable from a Milestone — R4) |
| `minutes` | INTEGER NOT NULL DEFAULT 0 | elapsed doing-minutes (start→finish); 0 while planned; tracking only |
| `did_retrieval` | INTEGER NOT NULL DEFAULT 0 | true if the retrieve step was engaged (boolean via `sqliteBool`); 0 while planned |
| `writeup_path` | TEXT (nullable) | relative vault path of the writeup (set on completion) |
| **`status`** | TEXT NOT NULL DEFAULT 'planned' CHECK ∈ {planned, completed} | **NEW** — session lifecycle (R2) |
| **`completed_at`** | TEXT (nullable) | **NEW** — ISO completion time; null while planned (R1) |

No `milestone_id` (R4); no `vault_id` (R3, transitive).

### `session_assignments` (existing; written at plan time)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid |
| `session_id` | TEXT NOT NULL → `sessions(id)` CASCADE | parent session |
| `resource_id` | TEXT NOT NULL → `resources(id)` CASCADE | the assigned Resource |
| `locator` | TEXT (nullable) | free-form (`p.10-15`, `00:15:30-00:23:45`, `#section-3`, …) |
| `assignment_kind` | TEXT NOT NULL CHECK ∈ `ASSIGNMENT_KIND` | `read` / `watch` / `listen` / `review` |

### `pretest_responses` (existing; question at plan time, answer at finish)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid |
| `session_id` | TEXT NOT NULL → `sessions(id)` CASCADE | parent session |
| `question` | TEXT NOT NULL | established at **plan** time |
| `user_response` | TEXT (nullable) | filled at **doing** time — recorded verbatim, **never graded** |
| `revealed_after` | INTEGER NOT NULL DEFAULT 0 | whether the "truth" was revealed (boolean) |

### `session_card_drafts` (**NEW** table)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid |
| `session_id` | TEXT NOT NULL → `sessions(id)` CASCADE | parent session |
| `front` | TEXT NOT NULL | the intended prompt (required at plan time) |
| `back` | TEXT NOT NULL DEFAULT '' | the answer (optional at plan; filled while doing) |
| `order_index` | INTEGER NOT NULL DEFAULT 0 | stable ordering of the staged list |

---

## Models

- `Session` (`models/session.ts`) — **add** `status: z.enum(["planned","completed"])` and `completed_at: z.string().nullable()`.
- `SessionAssignment` (`models/links.ts`) — unchanged.
- `PretestResponse` (`models/pretestResponse.ts`) — unchanged.
- **`SessionCardDraft`** (`models/sessionCardDraft.ts`, NEW) — `{ id, session_id, front, back, order_index }`; exported from `models/index.ts` and the `db` barrel.

---

## Relationships

```text
domains (vault_id)            ← Feature 009 vault anchor
  └─ courses (domain_id)
       ├─ milestones          (objective seed — not FK'd to session)
       └─ sessions (course_id, status)
            ├─ session_assignments (session_id → resources)   [plan time]
            ├─ pretest_responses   (session_id)               [Q plan time / answer finish]
            ├─ session_card_drafts (session_id)               [plan time → materialized at finish]
            └─ (cards made on finish: created with course_id; no session FK)
resources ← session_assignments.resource_id, card_resources.resource_id
```

Vault-scoped listing: `JOIN courses JOIN domains WHERE domains.vault_id = ?` for both planned and completed lists.

---

## Doing-phase state (held in the hook, not persisted as columns)

Materialized into the writeup / the session update on finish:

- **`startedAt`** (UI) → `minutes` = round((finish − start)/60000).
- **`retrievalText`, `selfTestText`** (UI) → rendered into the writeup body. `did_retrieval` = `retrievalText` non-empty.
- **`noteDraft`** (title + body) (UI) → atomic vault note (its own file), optionally the materialized cards' `note_path`.
- **`pretestAnswers`** (UI, keyed by `pretest_responses.id`) → `UPDATE pretest_responses SET user_response`.
- **`cardCompletions`** (UI, keyed by `session_card_drafts.id`; front/back edits + any added drafts) → materialized cards on finish.

The assignments and the objective are read-only during doing (established at plan time).

---

## Validation rules

- **Objective required** to save a plan (FR-002); `course_id` required.
- **Assignment**: `resource_id` must be a Resource in the active vault (FR-003); `assignment_kind` ∈ enum (DB CHECK + zod); `locator` optional.
- **Pretest question**: non-empty `question` required per row at plan time; `user_response` optional, never graded (FR-023).
- **Card draft**: `front` required at plan time; `back` may be empty until completed during doing (FR-005/FR-020); a card is only materialized on finish if it has a non-empty front (and back).
- All rows round-trip through their zod models on read (`selectParsed`).

---

## Two write paths

### `planSession(db, input)` → `Session` (status `planned`)

Input: `{ courseId, objective, assignments[], pretestQuestions: string[], cardDrafts: { front, back }[] }`.

Effect (transactional): insert `sessions` (`status='planned'`, `date=now`, `minutes=0`, `did_retrieval=0`, `writeup_path=null`, `completed_at=null`) → insert each `session_assignments` → insert each `pretest_responses` (question only) → insert each `session_card_drafts` (`order_index` by position). Writes **nothing** to the vault and creates **no** review cards.

### `finalizeSession(db, input)` → `Session` (status `completed`)

Input: `{ sessionId, minutes, didRetrieval, writeupPath, pretestAnswers: { id, userResponse, revealedAfter? }[], cards: { front, back }[] }` (+ the session's assignments are read from the DB for citation inheritance).

Effect (transactional, R7/R12):
1. `UPDATE sessions SET status='completed', minutes, did_retrieval, writeup_path, completed_at=now WHERE id=sessionId`.
2. `UPDATE pretest_responses SET user_response, revealed_after` per answer id.
3. read the session's `session_assignments`; for each completed card: `createCard` (course = session's course, `note_path` when present) then `addCardResource` per assignment **deduped by `resource_id`** (first locator wins — `card_resources` PK `(card_id, resource_id)`, finding D1).
4. `DELETE FROM session_card_drafts WHERE session_id = sessionId` (materialized).

Returns the updated `Session`. The vault writeup is written by the caller **after** this resolves (R7).
