---
description: "Task list for Feature 003 — SQLite Data Layer"
---

# Tasks: SQLite Data Layer

**Input**: Design documents from `specs/003-sqlite-data-layer/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/db-interface.md ✅, contracts/migration-contract.md ✅, quickstart.md ✅

**Tests**: Included and required — the data-integrity surfaces (migrations, FK enforcement, round-trips, validation) are a constitution quality gate (FR-011/SC-008). They run in Vitest against `node:sqlite` through the `SqlExecutor` seam, so each db test file starts with `// @vitest-environment node`.

**Organization**: By user story. The schema + plumbing are foundational (the v1 migration creates all 17 tables at once); stories layer typed access + tests on top. US2/US3 depend on the foundation, not on US1.

## Format: `[ID] [P?] [Story?] Description + file path`

- **[P]**: different files, no dependency on an incomplete task → parallelizable
- File paths are repo-root-relative.

## ⚠️ Git note

The user owns all git. **No task runs git.** The optional `before_tasks`/`after_tasks` commit hooks are surfaced, never executed.

---

## Phase 1: Setup (plugin wiring + deps)

**Purpose**: Bring SQLite into the Tauri shell and add the validation dependency.

- [X] T001 Add `tauri-plugin-sql` (with the `sqlite` feature) to `src-tauri/Cargo.toml`. (research R1)
- [X] T002 Register the plugin in `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_sql::Builder::default().build())` (no Rust migrations — schema lives in TS). (research R1/R2)
- [X] T003 Add `"sql:default"` and `"sql:allow-execute"` to the permissions in `src-tauri/capabilities/default.json`. (research R1)
- [X] T004 Install JS deps: `@tauri-apps/plugin-sql` and `zod` (both runtime `dependencies`). (research R1/R6)

**Checkpoint**: The Tauri shell can talk to SQLite; zod is available.

---

## Phase 2: Foundational (the `src/db` spine — blocks all stories)

**Purpose**: The `SqlExecutor` seam, both adapters, the migration runner, and the full v1 schema. Everything below depends on this.

**⚠️ CRITICAL**: No user story can be implemented or tested until this phase is complete.

- [X] T005 Define the `SqlExecutor` interface (`execute` / `select<T>` / `transaction`) + shared SQL types in `src/db/executor.ts`. (contracts/db-interface.md)
- [X] T006 [P] Production adapter wrapping `@tauri-apps/plugin-sql` (`Database.load("sqlite:cic.db")`) in `src/db/adapters/tauri.ts` — the **only** file importing the plugin. **Lint-enforce that**: add a `no-restricted-imports` entry to `eslint.config.js` confining `@tauri-apps/plugin-sql` to `src/db/adapters/**` (mirroring the existing AI-SDK restriction), so confinement is a checked rule, not just convention. (Constitution IV; guardrail #3 style; research R1)
- [X] T007 [P] Test adapter wrapping Node 24 `node:sqlite` (`DatabaseSync`), running `PRAGMA foreign_keys = ON` on open, in `src/db/adapters/node.ts` (imported by tests only). (research R3/R4)
- [X] T008 [P] Enum zod schemas (milestone_status, project_status, resource_kind, resource_role, assignment_kind, review_rating) in `src/db/models/enums.ts` — the single enum source mirrored by DDL CHECKs. (data-model; research R6)
- [X] T009 Author the v1 schema migration — the full 17-table DDL (PKs, FKs + ON DELETE per the cascade matrix, CHECK constraints, indexes) in `src/db/migrations/m0001_initial.ts`, registered in `src/db/migrations/index.ts` (ordered registry). Tables created in dependency order (referenced tables first). (data-model.md)
- [X] T010 Implement the migration runner in `src/db/migrate.ts`: read `PRAGMA user_version`; apply each migration with `version > current` ascending, each in a transaction, bumping `user_version`; idempotent when none pending; **throw if `user_version` exceeds the latest known version** (refuse newer-than-app). (contracts/migration-contract.md; research R2)
- [X] T011 [P] Generic typed-query helper in `src/db/repositories/query.ts`: `selectParsed(db, schema, sql, params)` (select + zod-parse each row) and small insert/update builders. Enough to round-trip any entity. (contracts/db-interface.md)
- [X] T012 Create the public barrel `src/db/index.ts` exporting the `SqlExecutor` type, `migrate`, and the enums (models/repos appended as they land; finalized in Polish).

**Checkpoint**: The schema can be created and migrated through the seam; integrity rules are in the DDL; tests can target `node:sqlite`.

---

## Phase 3: User Story 1 — Store stands up & the core hierarchy persists (Priority: P1) 🎯 MVP

**Goal**: On launch the store is created + migrated; a Domain → Course → Milestones can be recorded and read back across a restart with relationships intact.

**Independent Test**: With a fresh (file-backed) store, migrate, insert the hierarchy, close + reopen the executor, read it back — all present and linked; inserting a course under a missing domain is rejected.

- [X] T013 [P] [US1] `Domain` zod model + type in `src/db/models/domain.ts`. (data-model)
- [X] T014 [P] [US1] `Campaign` model in `src/db/models/campaign.ts`.
- [X] T015 [P] [US1] `Course` model (nullable `campaign_id`, `moc_path`) in `src/db/models/course.ts`.
- [X] T016 [P] [US1] `Milestone` model (`status` enum, `order_index`) in `src/db/models/milestone.ts`.
- [X] T017 [US1] Core repositories — typed CRUD for domains, courses, milestones — in `src/db/repositories/{domains,courses,milestones}.ts` (depend on T013–T016 + the query helper). (contracts/db-interface.md)
- [X] T018 [US1] `initDatabase()` composition root in `src/db/bootstrap.ts` (build Tauri adapter → load → `migrate()`); call it from `src/main.tsx` at startup so the running app creates + migrates its store, surfacing (not swallowing) errors. (contracts/db-interface.md; FR-001)
- [X] T019 [US1] Test: migration fresh-apply — `// @vitest-environment node`; on an empty `node:sqlite` db, `migrate()` takes `user_version 0 → latest` and all 17 tables exist, in `src/db/migrate.test.ts`. (FR-007/SC-001)
- [X] T020 [US1] Test: core round-trip + restart + dangling-parent — insert Domain→Course→Milestones, **close and reopen** a file-backed db, read back parsed with relationships intact; and inserting a Course referencing a missing Domain is rejected — `src/db/repositories/hierarchy.test.ts`. (FR-002/FR-003; US1 AS-1..3; SC-002)

**Checkpoint**: Persistence works end-to-end for the spine and survives restart — **MVP delivered**.

---

## Phase 4: User Story 2 — The complete model with integrity (Priority: P2)

**Goal**: Every §8 entity is modeled and durable; invalid data is rejected atomically; M:N links add/remove without harming linked records.

**Independent Test**: Create one of each entity + each relationship; confirm retrieval and that links resolve. Attempt invalid writes (bad enum, malformed JSON, dangling FK) → each rejected, nothing partial. Unlink a resource from a course → resource survives; delete a course → owned children go, resources remain.

- [X] T021 [P] [US2] `Project` model (`status` enum) in `src/db/models/project.ts`.
- [X] T022 [P] [US2] `Session` model (nullable `project_id`, `did_retrieval` bool) in `src/db/models/session.ts`.
- [X] T023 [P] [US2] `Card` model (`fsrs_state` opaque JSON, nullable `due_at`) in `src/db/models/card.ts`.
- [X] T024 [P] [US2] `Review` model (`rating` enum; `confidence` nullable int 1..5, **no default**) in `src/db/models/review.ts`.
- [X] T025 [P] [US2] `Streak` model (`domains_touched` JSON `string[]`) in `src/db/models/streak.ts`.
- [X] T026 [P] [US2] `PretestResponse` model in `src/db/models/pretestResponse.ts`.
- [X] T027 [P] [US2] `Resource` model (`kind` enum, `metadata` JSON object, nullable `ingested_at`) in `src/db/models/resource.ts`.
- [X] T028 [P] [US2] Join-link models (course_resources, session_assignments, card_resources, project_milestones, project_resources) in `src/db/models/links.ts`.
- [X] T029 [P] [US2] `VaultWrite` model (natural PK `file_path`, `app_mtime`, `app_hash`) in `src/db/models/vaultWrite.ts` — the 17th entity; lets the conflict-detection metadata (§13) be parsed/round-tripped now so the vault feature can record it later. (data-model; FR-009)
- [X] T030 [US2] Test: one-of-every-entity round-trip — `// @vitest-environment node`; insert a valid row for all 17 tables (respecting FKs) via the query helper, read each back parsed (incl. `vault_writes` via its model), links resolve; then re-record an existing `vault_writes.file_path` (natural-key upsert) and confirm it updates `app_mtime`/`app_hash` in place rather than duplicating — `src/db/integrity.roundtrip.test.ts`. (FR-002/FR-005/FR-009; SC-001)
- [X] T031 [US2] Test: FK enforcement — inserting children with dangling parents (representative across relationships) is rejected — `src/db/integrity.fk.test.ts`. (FR-003/SC-003)
- [X] T032 [US2] Test: validation — bad enum value, malformed JSON column, and out-of-range `confidence` are each rejected with no partial write — `src/db/integrity.validation.test.ts`. (FR-004/SC-003)
- [X] T033 [US2] Test: cascade — deleting a Course removes its milestones/sessions/cards and `course_resources` links but keeps the `resources`; deleting a Project sets dependent `sessions.project_id`/`cards.project_id` to NULL — `src/db/integrity.cascade.test.ts`. (FR-003/FR-005)

**Checkpoint**: The full §8 model persists with enforced integrity. US1 + US2 both demonstrable.

---

## Phase 5: User Story 3 — Safe schema evolution (Priority: P3)

**Goal**: The schema upgrades across releases — pending migrations apply once, in order, losslessly; an up-to-date store is untouched; a newer-than-app store is refused.

**Independent Test**: Register a throwaway v2 migration in the test; verify version-bump, idempotency, lossless upgrade, and refuse-newer.

- [X] T034 [US3] Test: idempotency + version-bump + refuse-newer — `// @vitest-environment node`; second `migrate()` applies 0; with a dummy v2 registered, `1 → 2` applies only #2; a store with `user_version` beyond latest makes `migrate()` throw — `src/db/migrate.evolution.test.ts`. (FR-007/FR-008; SC-004/SC-005)
- [X] T035 [US3] Test: lossless upgrade — insert rows at v1, apply a dummy v2 that adds a column, confirm prior rows survive intact — `src/db/migrate.lossless.test.ts`. (FR-008/SC-005)

**Checkpoint**: The store can evolve across app versions without data loss.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T036 [P] Finalize the `src/db/index.ts` barrel — export all models, enums, the core repositories, `migrate`, and `initDatabase`. (contracts/db-interface.md)
- [X] T037 [P] Verify the knowledge/tracking boundary (SC-006/FR-006): review the schema — only tracking state + `*_path` string links; the sole content columns are `cards.front/back` (SRS artifacts per §8, documented). No note/MOC bodies anywhere.
- [X] T038 Run `npm run build` — tsc strict + Vite clean; confirm `src/db/adapters/node.ts` is **not** bundled into the app (only tests import it).
- [X] T039 Run `npm run test` (all db integrity/migration tests green) and `npm run lint` (ESLint clean — the `no-restricted-imports` rule now enforces that `@tauri-apps/plugin-sql` is imported only from `src/db/adapters/**`, alongside the AI-SDK restriction). (FR-011/SC-008)
- [ ] T040 Manual runtime check: `npm run tauri dev` → confirm `cic.db` is created in the app config dir and migrated (open it in a SQLite browser: 17 tables, `user_version` = latest); confirm zero network activity from the store (SC-005/FR-010). (GUI/runtime — user)
- [X] T041 Prepare the end-of-feature walkthrough notes (the SqlExecutor seam + adapters, the TS migration runner, the schema + cascade decisions, FK/validation strategy, FR→verification results). (SOP)

---

## Dependencies & Execution Order

### Phase order

- **Setup (P1)** → **Foundational (P2)** → **US1 (P3)** → **US2 (P4)** → **US3 (P5)** → **Polish (P6)**.
- **Foundational blocks everything** — the seam, runner, and v1 schema must exist before any story's typed access or tests.
- **US2 and US3 depend on the foundation, not on US1** — they can proceed in parallel with US1 once Phase 2 is done (different files).

### Within stories

- US1: models T013–T016 are [P]; repos (T017) need the models + query helper; bootstrap (T018) needs the adapter + runner; tests (T019–T020) need the runner + repos.
- US2: models T021–T029 are all [P]; the four integrity tests (T030–T033) need the models + schema.
- US3: T034/T035 need only the runner (Phase 2) — independent of US1/US2 models.

### Parallel opportunities

- Setup: T001–T003 touch `src-tauri/*` (sequence them — same area); T004 is independent.
- Foundational: T006, T007, T008, T011 are [P] (different files); T009→T010 sequential-ish (runner needs the registry); T012 last.
- US1: the 4 models in parallel. US2: the **9 models in parallel** is the big win.
- US3 tests can run alongside US2 (different files, both need only Phase 2).
- Polish: T036/T037 [P].

---

## Parallel Example: US2 models

```text
# After Phase 2, the entity models are independent files:
Task T021: project.ts   Task T022: session.ts   Task T023: card.ts
Task T024: review.ts    Task T025: streak.ts     Task T026: pretestResponse.ts
Task T027: resource.ts  Task T028: links.ts      Task T029: vaultWrite.ts
```

---

## Implementation Strategy

### MVP first (US1)

1. Setup → Foundational → US1. **Stop and validate**: the app creates + migrates its store, and the Domain→Course→Milestone hierarchy round-trips across a restart with integrity. That alone is the persistence foundation everything else needs.

### Incremental delivery

1. Setup + Foundational → seam, runner, full schema ready.
2. US1 → core hierarchy persists + restart-safe → **MVP**.
3. US2 → complete model + enforced integrity.
4. US3 → safe evolution across releases.
5. Polish → barrel, knowledge-boundary check, build/test/lint, runtime store verification.

### Notes

- Every row read is zod-parsed before a feature sees it; every write is validated before SQL runs (no partial writes).
- `reviews.confidence` and `cards.fsrs_state` carry no auto-filled defaults — the store records engagement, never manufactures it (Constitution III).
- Never edit a shipped migration — schema changes are always a new migration (migration contract rule 8).
- The `node:sqlite` adapter is test-only; if it proves flaky under Vitest, the seam makes swapping to `better-sqlite3` a one-file change (research R3).
- The runtime store check (T040) needs the GUI — that part is the user's.
