# Research — Native FSRS Spaced Repetition (010)

Phase 0 decisions. Each: **Decision · Rationale · Alternatives rejected.** Grounded in a codebase survey (existing `cards`/`reviews`/`resources`/`card_resources` schema from 003, the vault spine from 005, the 009 vault-scoping pattern, the 002 component kit, and the Tauri capability allowlist).

---

## R1 — Scheduling engine: `ts-fsrs` behind a thin `Scheduler` interface

**Decision.** Use the **`ts-fsrs`** library for FSRS scheduling (locked by Constitution "Technology Constraints" and PRD §F3/§13). Wrap it behind a small domain interface — `Scheduler` — in `src/features/srs/fsrs/`. The rest of the app (repositories, hooks, UI) depends only on `Scheduler` + our own domain types (`Grade`, `SchedulingState`); **`ts-fsrs` is imported in exactly one implementation file** (`fsrs/scheduler.ts`).

**Rationale.** Interface-first / deep-modules (Constitution IV): the FSRS algorithm is a thick implementation that must not leak its vocabulary (`ts-fsrs`'s `Rating`/`Card`/`State` enums) into the UI or repo layer. A `Scheduler` seam keeps the library swappable, makes scheduling unit-testable without the UI, and mirrors how vendor SDKs are quarantined behind adapters. ts-fsrs is the reference TS implementation, actively maintained, zero-native, pure-function friendly.

**Alternatives rejected.** *Hand-roll FSRS weights* — error-prone, reinvents a maintained library, violates the locked tech choice. *Call `ts-fsrs` directly from the review hook/UI* — leaks library types across the app, couples the review screen to the scheduler's representation, fails Constitution IV's "no leaky abstractions."

---

## R2 — Persisting scheduling state: `ts-fsrs` card JSON in `cards.fsrs_state`

**Decision.** Store the ts-fsrs scheduling card (its `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`) as a JSON object in the existing **`cards.fsrs_state`** column (already `jsonColumn(jsonObject).nullable()`). Mirror two fields into dedicated columns for cheap querying: **`cards.due_at`** ← scheduling `due` (ISO-8601), **`cards.last_reviewed`** ← `last_review`. `fsrs_state IS NULL` denotes a **never-scheduled new card**.

**Rationale.** The schema already reserves exactly these columns (003's `card.ts` comment: "`fsrs_state` … the SRS feature owns"). Keeping the full algorithm state opaque-but-whole in one JSON column means future ts-fsrs param changes don't need a migration; the mirrored `due_at` (already indexed via `idx_cards_due_at`) powers the due-queue `WHERE` without JSON extraction. A `SchedulingState` zod schema validates the JSON on read (never trust raw shape — Constitution code conventions).

**Alternatives rejected.** *Explode every FSRS field into columns* — migration churn, ties the table to one library's state shape. *Recompute schedule from the `reviews` log each load* — FSRS is path-dependent and expensive to replay; the stored state is the source of truth, `reviews` is the audit/calibration log.

---

## R3 — Grade mapping: domain `Grade` ↔ FSRS `Rating`

**Decision.** Domain grades are the existing `REVIEW_RATING` enum `["again","hard","good","easy"]`. The `Scheduler` impl maps them 1:1 to ts-fsrs `Rating` (`Again=1, Hard=2, Good=3, Easy=4`). The stored `reviews.rating` uses our string enum; the mapping lives only in the scheduler impl.

**Rationale.** A clean, total, order-preserving bijection already exists between the schema's CHECK-constrained enum and FSRS ratings — no "Manual"/"reschedule" rating is needed for V1. Keeping strings in the DB (not FSRS's integers) keeps `reviews` self-describing and decoupled from the library.

**Alternatives rejected.** *Store FSRS integer ratings* — opaque in the DB, couples persisted data to the library. *Expose all of ts-fsrs's rating semantics (incl. `Manual`)* — out of scope; V1 is the four-button grade.

---

## R4 — New cards: "new until first review", immediately due, daily cap (FR-012)

**Decision.** A card is **new** while it has zero `reviews` rows (equivalently `fsrs_state IS NULL`). New cards are **immediately due**. The number of *new* cards that enter the queue per day is limited by a **configurable cap** (default 20), stored as a setting `srs.dailyNewCap` (string) in the existing key-value `settings` table. The due queue admits: *all* due **review** cards (`fsrs_state` set, `due_at <= now`) **plus** up to `max(0, cap − newIntroducedToday)` new cards, where `newIntroducedToday` = count of distinct cards whose **earliest** review timestamp falls on the current local day.

**Rationale.** "New until first review" needs no extra state — it's derivable from `reviews`. The cap prevents a freshly-authored batch from flooding the session (the Anki throttle the user asked for) while keeping authored cards available across subsequent days. Using the generic `settings` table avoids a migration (006 pattern). Counting "introduced today" via the first-review timestamp is deterministic and unit-testable at the day boundary.

**Alternatives rejected.** *Schedule new cards into the future* (the "scheduled, not instant" option) — user chose immediate. *No cap* — user chose a cap. *A dedicated `new_introduced` ledger table* — over-engineered; the `reviews` MIN-timestamp derivation is sufficient and avoids schema/state drift.

---

## R5 — Due-queue ordering & vault scoping

**Decision.** `listDueCards(db, vaultId, now, cap)` returns review-due cards then new cards (capped), each block ordered by `due_at ASC` (new cards by `created_at ASC`). Scoping joins through the hierarchy: `cards → courses → domains WHERE domains.vault_id = ?` — identical to the 009 `listCourses` join. Cards inherit vault scope transitively; **no `vault_id` on `cards`**.

**Rationale.** Cards cascade under `course → domain`, which 009 already scoped by `vault_id`; the join reuses the indexed path and needs no new column on `cards`. Review-due-before-new keeps spacing honest (clear the backlog before adding load). Ordering by `due_at` surfaces the most-overdue first.

**Alternatives rejected.** *Add `cards.vault_id`* — redundant denormalization; the join is cheap and the cascade already encodes ownership. *Interleave new + due randomly* — V1 favors a deterministic, explainable queue; interleaving/variability is F6's job, out of scope.

---

## R6 — Resource vault-scoping: additive `resources.vault_id` (NOT global, NOT transitive)

**Decision.** Add a nullable **`resources.vault_id`** column (FK → `vaults(id)`) + index, and scope the Resource registry + citation pickers by the active vault — exactly mirroring 009's `domains.vault_id`. New Resources are stamped with the active vault id; a one-shot adoption (`UPDATE resources SET vault_id=? WHERE vault_id IS NULL`) claims any legacy rows on first attach (a no-op here — the feature is new).

**Rationale.** `resources` is a *parallel* entity (linked M:N to courses via `course_resources`), so it does **not** inherit vault scope through the domain cascade like cards do. Leaving it global would reproduce the **exact 009 Scenario-D bug** at the Resource level (vault A's registered PDFs showing while in vault B). An explicit `vault_id` is the consistent, indexed, future-proof fix and sets up the later Resources feature cleanly.

**Alternatives rejected.** *Global resources (no scoping)* — re-introduces the cross-vault leak 009 was built to kill; inconsistent with the vault-as-boundary model. *Transitive scoping via `course_resources` joins* — an unlinked Resource would belong to no vault, breaking the "register then link" registry UX; also makes every list a 3-table join. *A `domains`-style rebuild* — unnecessary and unsafe under the FK-on/pooled runner (009 R3); a nullable `ADD COLUMN` is safe and sufficient.

---

## R7 — Block-ref citations (F3.6): deterministic `^block-id`, idempotent, via `VaultWriter`

**Decision.** To cite a paragraph of a vault note, insert a stable Obsidian block-id marker (` ^cic-<hash>`, where `<hash>` is the first 8 hex chars of SHA-256 of the trimmed paragraph text) at the end of that paragraph — **idempotently** (skip if already present). The write is **read-modify-write through the vault layer only**: `VaultReader.readNote` → splice the marker into the body → `VaultWriter.writeNote` (honoring the `WriteResult` conflict/`overwrite` contract). Store the chosen id in a new **`cards.note_block_id`** column alongside the existing `cards.note_path`; the citation renders as `[[<note>#^<block-id>]]`.

**Rationale.** Content-derived ids are idempotent across re-citations (PRD F7 "block-id management": deterministic, no `^abc ^abc` build-up). Only `VaultWriter` may touch `.md` (Constitution I) — there is no read-modify-write helper today, so the caller composes `readNote`+`writeNote`, and the never-clobber drift mechanism (mtime+hash via `VaultWriteLog`) protects the user's open note. Storing the id on the card (one block-ref per card's source note) keeps the citation reconstructable.

**Alternatives rejected.** *Random/UUID block-ids* — non-idempotent; regeneration duplicates markers. *Ad-hoc `fs.writeFile` to splice the marker* — violates Constitution I (the single sanctioned write path). *A separate `card_note_refs` table* — one source note per card is the V1 model; a column is simpler than a table. *Skip block-refs entirely* — the user explicitly pulled F3.6 into scope.

---

## R8 — Citation deep-linking (F3.7): `tauri-plugin-opener`, best-effort per kind

**Decision.** On review, activating a Resource citation calls the already-enabled **`tauri-plugin-opener`** `open(target)` with a per-kind, locator-aware target: PDF → `file://…#page=N`; web/video-URL → the URL (`#anchor`/`?t=` appended when the locator provides it); EPUB/Markdown → the file (or Obsidian for vault Markdown); book/audio → no auto-open, **show the locator string**. Block-ref citations best-effort open the note (`obsidian://open?...` when available, else the file). Every path degrades gracefully — a missing file/unreachable URL surfaces the locator text and a calm message, never an error.

**Rationale.** `opener:default` is already in `src-tauri/capabilities/default.json` — **no new native capability or Rust** needed. Most desktop PDF viewers honor `#page=N`; YouTube honors `?t=`; this matches PRD F2.3's "external viewer launch only, best-effort" rule. The opener call is the only Tauri touch and is wrapped so tests stay runtime-free.

**Alternatives rejected.** *Embedded PDF/video viewers* — explicitly deferred (PRD §14). *Adding `tauri-plugin-shell`* — unnecessary; opener covers files + URLs. *Failing hard when a source can't open* — violates "fail gracefully" (Constitution code conventions).

---

## R9 — One additive migration `m0004_srs_scoping`

**Decision.** Ship a single additive migration (version 4): `ALTER TABLE resources ADD COLUMN vault_id TEXT REFERENCES vaults(id)` + `CREATE INDEX idx_resources_vault_id` (R6), and `ALTER TABLE cards ADD COLUMN note_block_id TEXT` (R7). No table rebuilds. As in 009, registering v4 **bumps the three latest-version migration tests** (`migrate.test.ts`, `migrate.evolution.test.ts`, `migrate.lossless.test.ts`) and the `settings.test.ts` version assertion.

**Rationale.** `cards`/`reviews`/`card_resources` already have every SRS column (003) — the only schema gaps are the two design choices above (R6, R7). Additive `ADD COLUMN` is safe under the FK-on/pooled forward-only runner (009 R3 established that table rebuilds are unsafe; additive columns are fine). One cohesive migration beats two.

**Alternatives rejected.** *No migration* (keep resources global, derive block-refs) — rejected by R6/R7. *Two separate migrations* — needless; both columns are additive and ship together. *Rebuild tables to add NOT NULL* — unsafe + unnecessary; nullable columns suffice.

---

## R10 — Information architecture & navigation

**Decision.** Three UI surfaces:
1. **Review** — flip the existing placeholder `/review` route + nav item (`navigation.ts` already declares it, `implemented:false`) to a real vault-wide due-queue session screen (`src/features/srs/`).
2. **Resources** — a **new** top-level `/resources` route + nav item for the registry (CRUD + Course links).
3. **Course detail** — a **new** route `/courses/:courseId` (no Course detail exists today; Courses is list-only) hosting per-course **card authoring/listing** and the citation editor.

Dashboard: replace the `DeferredTiles` "Due cards" placeholder with a real due count, and add an "overconfident cards" calibration surface (both real-data-only — Constitution III).

**Rationale.** Matches the resolved FR-025 (Review global, cards on the Course). The nav auto-renders from `DESTINATIONS`, so additions are one-line. Reusing the 002 kit (`Panel`, `Segmented`/`Rating`, `Citation`, `Callout`, `Tag`, `StatCell`) keeps the Obsidian theme consistent (purple brand; cyan reserved for AI — not used here).

**Alternatives rejected.** *Everything on one Cards/Review screen* / *everything under Courses* — both rejected by the user at clarify. *Card authoring in a modal off the Courses list* — the spec mandates a Course **detail** screen; a route is cleaner and reusable for future per-course content.

---

## R11 — Calibration: confidence has NO default; overconfidence rule (F3.5, Constitution III)

**Decision.** The confidence control (1–5) renders with **no pre-selected value** — the user must actively pick one each review; the review cannot be submitted without it. Confidence is captured in the existing `reviews.confidence` (CHECK 1–5, nullable at the schema level but required by the UI). "Overconfident" = a card whose **most recent** review had `confidence >= 4` **and** `rating = 'again'`; surfaced on the dashboard.

**Rationale.** Constitution III is explicit: "Calibration confidence ratings (F3.5) have **no default value** — an autofilled '3' defeats the mechanism." Requiring an active pick is the whole point (metacognition). Using "most recent review" keeps the surface current as the user re-learns a card.

**Alternatives rejected.** *Default confidence to 3* — directly violates Constitution III. *Make confidence optional* — weakens the calibration signal the feature exists to build. *Aggregate overconfidence across all history* — noisier; "most recent" reflects current calibration.

---

## R12 — Atomic review transaction

**Decision.** Recording a review (`recordReview`) updates the card (`fsrs_state`, `due_at`, `last_reviewed`) **and** inserts the `reviews` row inside a single `SqlExecutor.transaction(...)`.

**Rationale.** The card's schedule and its audit log must move together; a crash between the two would desync the schedule from history (SC-003 "no review silently lost"). The `SqlExecutor` seam already exposes `transaction`.

**Alternatives rejected.** *Two independent writes* — risks a card advancing with no logged review (or vice-versa) on failure.

---

## R13 — Per-kind Resource metadata via a zod discriminated union

**Decision.** Store kind-specific metadata in the existing `resources.metadata` JSON column, validated by a **zod discriminated union on `kind`** (e.g., `book` → `{author?, isbn?}`; `video_url`/`web_page` → `{url}` already on the row + `{channel?/site?}`; `video_file`/`audio` → `{durationSec?}`; `pdf`/`epub`/`markdown` → `{author?, pages?}`). The registry form renders kind-appropriate fields; unknown/extra keys are rejected on parse.

**Rationale.** `resources` already has a generic `metadata TEXT DEFAULT '{}'` column (003) — no schema change for per-kind fields. A discriminated union gives type-safe, validated, kind-specific shapes without a column-per-field explosion across 8 kinds. `file_path`/`url` stay first-class columns (used for opener targets); `metadata` holds the rest.

**Alternatives rejected.** *A column per metadata field* — sparse, 8-kind explosion, migration per new field. *Freeform untyped JSON* — violates "validate all external input through zod"; the registry would accept garbage. *A table per kind* — massive over-engineering for a personal registry.

---

## Resolved unknowns

| Spec marker | Resolution |
|---|---|
| FR-012 new-card policy | R4 — new = no reviews; immediately due; configurable daily cap (default 20) via `settings`. |
| FR-019 Resource registry scope | R6 + R13 — fuller registry, vault-scoped via `resources.vault_id`, per-kind metadata via zod union; later Resources feature = assignments + ingestion only. |
| FR-025 IA placement | R10 — Review = top-level screen; cards on a new Course detail route; Resources = own screen. |

No open NEEDS CLARIFICATION remain.
