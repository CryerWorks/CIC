# Data Model — Native FSRS Spaced Repetition (010)

The SRS tracking schema already exists (Feature 003, migration v1). This feature adds **two columns** (migration v4) and gives runtime meaning to columns 003 reserved. Knowledge content stays in the vault; only the SRS artifacts `cards.front`/`cards.back` live in SQLite (Constitution I tracking/knowledge boundary).

---

## Migration `m0004_srs_scoping` (version 4, additive)

```sql
ALTER TABLE resources ADD COLUMN vault_id TEXT REFERENCES vaults(id);
CREATE INDEX IF NOT EXISTS idx_resources_vault_id ON resources(vault_id);
ALTER TABLE cards ADD COLUMN note_block_id TEXT;
```

- `resources.vault_id` — scopes the Resource registry to the active vault (R6); nullable, adopted on first attach.
- `cards.note_block_id` — the Obsidian block-id of the cited paragraph in `cards.note_path` (R7); nullable.
- No table rebuilds; safe under the FK-on/pooled forward-only runner. Bumps the three latest-version migration tests + `settings.test.ts` to v4 (R9).

---

## Entities

### Card (existing table; SRS semantics defined here)
| Field | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid |
| `course_id` | TEXT → courses | required; the vault-scope path (`course → domain.vault_id`) |
| `project_id` | TEXT → projects | nullable (Projects are F11; left null here) |
| `note_path` | TEXT | nullable; optional source note in the vault |
| `note_block_id` | TEXT | **NEW**; block-id within `note_path` for a block-ref citation |
| `front` | TEXT | required; the prompt (SRS artifact — allowed outside vault) |
| `back` | TEXT | required; the answer |
| `fsrs_state` | JSON | nullable; the `SchedulingState` (below). `NULL` ⇒ new card |
| `due_at` | TEXT (ISO) | nullable; mirror of scheduling `due`; indexed (`idx_cards_due_at`) |
| `last_reviewed` | TEXT (ISO) | nullable; mirror of scheduling `last_review` |
| `created_at` | TEXT (ISO) | required |

**States:** `new` (`fsrs_state IS NULL`, zero reviews) → after first grade, FSRS-managed (`learning`/`review`/`relearning`, encoded inside `fsrs_state.state`). Editing `front`/`back` MUST NOT touch `fsrs_state`/`due_at` (FR-011).
**Validation:** `front`/`back` non-empty. **Lifecycle:** deleting the Course/Domain cascades (FK `ON DELETE CASCADE`) → cards + their reviews + `card_resources` removed (FR-024).

### SchedulingState (shape of `cards.fsrs_state` JSON)
The ts-fsrs scheduling card, validated by a zod schema on read (R2):
| Field | Type | |
|---|---|---|
| `due` | ISO string | next review |
| `stability` | number | |
| `difficulty` | number | |
| `elapsed_days` | number | |
| `scheduled_days` | number | |
| `reps` | number | |
| `lapses` | number | |
| `state` | int (0–3) | New/Learning/Review/Relearning |
| `last_review` | ISO string \| undefined | |
Opaque to the rest of the app; produced/consumed only by the `Scheduler` (R1). Malformed/absent ⇒ treated as a new card and re-initialized (FR-021).

### Review (existing table)
| Field | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid |
| `card_id` | TEXT → cards | cascade-delete with the card |
| `rating` | TEXT | CHECK in `('again','hard','good','easy')` |
| `confidence` | INTEGER | CHECK 1–5; **required by the UI (no default — R11)**, nullable at schema level |
| `reviewed_at` | TEXT (ISO) | required |
| `elapsed_ms` | INTEGER | nullable; time from reveal to grade |

Immutable, append-only. The MIN(`reviewed_at`) per card drives "new introduced today" (R4); the latest row per card drives overconfidence (R11) and `last_reviewed`.

### Resource (existing table; +vault_id)
| Field | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid |
| `vault_id` | TEXT → vaults | **NEW**; active-vault scope (R6) |
| `title` | TEXT | required |
| `kind` | TEXT | CHECK in the 8 `RESOURCE_KIND` values |
| `file_path` | TEXT | nullable; opener target for file kinds |
| `url` | TEXT | nullable; opener target for url kinds |
| `metadata` | JSON | per-kind fields, zod discriminated union on `kind` (R13); default `{}` |
| `ingested_at` | TEXT | nullable; stays null (ingestion is a later feature) |
| `added_at` | TEXT (ISO) | required |

**Per-kind `metadata` (R13):** `book` → `{author?, isbn?}`; `pdf`/`epub`/`markdown` → `{author?, pages?}`; `video_file`/`audio` → `{durationSec?}`; `video_url` → `{channel?}`; `web_page` → `{site?}`. Validated on read/write; extra keys rejected.

### CourseResource (existing link table)
`(course_id, resource_id)` PK + `role` (`primary`/`secondary`/`reference`). Links a Resource to a Course (FR-019). Cascade-deletes with either side.

### CardResource (existing link table) — Resource citation (F3.7)
`(card_id, resource_id)` PK + `locator` TEXT (nullable: page / `t=` seconds / anchor). A card's citation to a Resource (FR-015). Cascade-deletes with either side. The opener target is derived from the Resource's `file_path`/`url`/`kind` + this `locator` (R8).

### Setting (existing key-value table)
New key `srs.dailyNewCap` (string int, default `"20"`) — the daily new-card cap (R4). Read via `getSetting`, written via `setSetting`; no schema change.

---

## Relationships (scope path bolded)

```
vaults ──< domains ──< courses ──< milestones
                          │  └──< cards ──< reviews
                          │         └──< card_resources >── resources >── vaults
                          └──< course_resources >── resources
```

- **Vault scope of cards/reviews:** transitive — `card → course → domain.vault_id` (R5). No `vault_id` on cards.
- **Vault scope of resources:** explicit — `resources.vault_id` (R6).
- A Card cites **0..N Resources** (`card_resources`, each with a locator) and **0..1 note paragraph** (`note_path` + `note_block_id`).

---

## Derived read-models (no new tables)

- **Due queue** — `listDueCards(db, vaultId, now, cap)`: due review cards (`fsrs_state` set, `due_at <= now`) + up to `cap − newIntroducedToday` new cards (R4/R5).
- **Due count** — count of the above, for the dashboard tile (replaces the `DeferredTiles` placeholder).
- **Overconfident cards** — cards whose latest review has `confidence >= 4 AND rating = 'again'`, scoped by vault (R11), for the dashboard calibration surface.

All scoped via the `course → domain.vault_id` join (cards) or `resources.vault_id` (resources), behind repository functions over the `SqlExecutor` seam.
