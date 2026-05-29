# Research — The Daily Loop (Feature 012, two-phase)

Phase 0 decisions. Each: **Decision · Rationale · Alternatives rejected.**

> **Revision (2026-05-29).** The original research assumed a single-sitting flow where a `sessions` row meant a *completed* session, so no migration and no `status` were needed (old R1/R2). The two-phase model (plan → do) reverses that: a planned session is persisted **before** it is done, so sessions now need a lifecycle. R1/R2/R5 below are rewritten; R3/R4/R6/R7/R8 stand; R9 is expanded; R10–R12 are new.

---

## R1 — One additive migration (m0006), schema version 5 → 6

**Decision**: Add migration `m0006_session_lifecycle`: `sessions.status` + `sessions.completed_at`, and a new `session_card_drafts` table (+ index). Schema `user_version` goes **5 → 6**.

**Rationale**: `m0001` created `sessions`, `session_assignments`, `pretest_responses` (and the `Session`/`PretestResponse`/`SessionAssignment` zod models already exist — the last in `models/links.ts`). But the two-phase model needs two things the §8 schema lacks: (1) a **lifecycle** so a planned session can exist before it is done (`status`), distinguished from completed ones, with a `completed_at` for ordering history; (2) somewhere to persist **intended card prompts** between planning and doing — `cards` can't hold them (a draft prompt is not yet a review card, and putting it in `cards` would either pollute the queue or require a draft flag that muddies FSRS — Constitution III). A dedicated `session_card_drafts` table keeps drafts out of the SRS queue until the learner engages them on finish.

**Alternatives rejected**:
- *Reuse `cards` with a "draft" flag* — leaks un-engaged prompts into the SRS domain; risks them being counted/scheduled; violates "a card is learned only through engagement."
- *Store drafts as JSON on `sessions`* — denormalized, not round-tripped through a zod row model like everything else; harder to test/query.
- *No `completed_at`, reuse `date`* — `date` is the planned date; overwriting it on finish loses the plan timestamp and muddies "planned" ordering. A second nullable column is cheap and honest.

---

## R2 — Persist at plan time; update to completed at finish (session lifecycle)

**Decision**: `planSession` inserts a `sessions` row with `status='planned'` plus its `session_assignments`, `pretest_responses` (question only, `user_response` null), and `session_card_drafts`. `finalizeSession` later **updates** that row to `status='completed'` (setting `minutes`, `did_retrieval`, `writeup_path`, `completed_at`), fills the pretest answers, materializes the card drafts into real cards, and deletes the drafts — all in one transaction.

**Rationale**: The whole point of the revision is that a session is **established, then done** (like a real course). The plan must be durable so the learner can come back and do it. A `status` column models the two states cleanly. Abandoning the *doing* flow simply leaves the row `planned` (re-doable) — strictly better than the old "abandon discards everything," and it sidesteps orphaned-row risk because the only rows that exist are deliberately-saved plans.

**Alternatives rejected**:
- *Keep single-sitting (old R2)* — contradicts the corrected product model; conflates instructor/syllabus with student/doing.
- *Separate `session_plans` table distinct from `sessions`* — duplicates most columns and the vault-scoping join; a `status` discriminator on one table is simpler and matches §8.

---

## R3 — Vault scoping is transitive (no `sessions.vault_id`)

**Decision** (unchanged): Scope sessions — planned and completed — to the active vault via `session.course_id → courses.domain_id → domains.vault_id` (Feature 009). `listPlannedSessions` / `listSessionsByVault` join through to `domains.vault_id`.

**Rationale**: Feature 009 anchors the vault boundary on `domains.vault_id`; a session always belongs to a Course (NOT NULL), so it is transitively scoped already. A new `sessions.vault_id` would duplicate the boundary and risk drift.

**Alternatives rejected**: *Denormalize `sessions.vault_id`* — redundant with the Domain anchor.

---

## R4 — Milestone selection is objective-seed-only

**Decision** (unchanged): Selecting a Milestone when planning **seeds the editable objective text** from the milestone's `capability`. The session stores no `milestone_id`.

**Rationale**: §8 `sessions` has no `milestone_id` (the same gap deferred for `cards` in Feature 010). Seeding the objective realizes the user value (FR-002) without re-opening that schema decision mid-feature. The objective text is the durable artifact.

**Alternatives rejected**: *Additive `sessions.milestone_id` now* — re-opens the deferred §8 decision; better handled holistically when F6/milestone-progress needs it.

---

## R5 — Card drafts are staged at plan time, materialized (cited) at finish

**Decision**: Intended card prompts live in `session_card_drafts` from plan time. On finish, each draft → `createCard` (course = the session's course; `note_path` = the atomic note if any) with `fsrs_state = null` (new), then `card_resources` rows inherited from the session's **assignments**, **deduped by `resource_id`** (first locator wins). The drafts are deleted once materialized.

**Rationale**: Staging prompts up front realizes "full lesson plan" (the learner decides what cards to make as part of establishing the session). Materializing at finish keeps un-engaged prompts out of the SRS queue until the learner actually does the session. Inheriting citations from the whole session's assignments realizes FR-021/SC-005 and reuses `card_resources` (F3.7). Dedupe-by-resource is mandatory: `card_resources` PK is `(card_id, resource_id)`, so two assignments on the same resource must collapse to one citation (analyze finding D1 from the first cut, preserved).

**Alternatives rejected**:
- *Per-draft citation selection persisted at plan time* — needs a `session_card_draft_resources` link table for a v1 nicety; the whole-session inheritance is simpler and the card-detail editor can refine later.
- *Create cards at plan time* — would put un-engaged cards in the review queue before the session is done (Constitution III violation).

---

## R6 — Writeup location, naming, and never-clobber

**Decision** (unchanged): Write the writeup to `Sessions/<YYYY-MM-DD> <objective-slug> (<short-id>).md` (`<short-id>` = first 8 chars of the session id). Frontmatter: `type: log`, `date` (completion date), `course`, `objective`. The atomic note goes to `<title>.md`. Both via `VaultWriter.writeNote`; a `conflict` surfaces "write anyway" (`overwrite: true`).

**Rationale**: The short id makes the filename collision-free across same-day/same-course sessions, so finish is a clean first-write. `type: log` keeps the writeup distinguishable from a `cic-type: course` MOC (F7 rescan never mistakes it for a Course). Routing both through `VaultWriter` honors Constitution I.

**Alternatives rejected**: *Bare `Sessions/<date> <course>.md`* — collides on a second same-day session; *updating the Course MOC's sessions section* — F7/F8 territory, out of scope.

---

## R7 — Finish ordering & failure isolation

**Decision** (unchanged): On finish: (1) the DB update (session → completed + pretest answers + materialized cards) runs first, in a transaction; (2) then the vault writes (atomic note, then writeup). If a vault write fails, the session **stays completed** and the UI surfaces a **retry**; the precomputed `writeup_path` makes the retry deterministic.

**Rationale**: Matches the spec edge case. The DB write is cheaper/safer; the vault write is the riskier one (Obsidian may hold the file). Recording `writeup_path` up front means a retry targets a fixed path.

**Alternatives rejected**: *Vault-first* — a DB failure after a vault write leaves a writeup with no completed record; *treat a vault failure as fatal* — loses the completed session.

---

## R8 — Active-study opening reuses the existing opener seam (+ range fix)

**Decision** (unchanged, extended): Active study resolves each assignment's `Resource` and opens it via `resourceTarget(resource, locator)` + `openCitation(target)` from `features/srs/citations/openTarget` (PDF page via browser, video `?t=`, `file://`, locator-as-text for physical/audio). **Fix**: `toSeconds` now parses the **start** of a range locator (`10:30-15:30` → 630s) instead of falling through to the first integer (`10`).

**Rationale**: Reuse the proven seam; the injected opener keeps the step jsdom-testable; `openCitation` degrades to `{opened:false}`. The range bug was a real defect found in live use (FR-015).

**Alternatives rejected**: *A new open path inside the loop* — duplicates logic and the Windows PDF `#page=` browser routing solved in 011.

---

## R9 — Two surfaces: plan on the Course, do on the Daily Loop

**Decision**: Planning lives on the **Course-detail** route (`/courses/:courseId`), alongside the Course's cards: a "Sessions" section listing planned sessions + a "Plan a session" form. The **Daily Loop** route (`/loop`) is the doing surface: a list of the active vault's **planned** sessions to start, plus a short **recent-completed** list (objective + date, linking to each writeup).

**Rationale**: Matches the corrected model ("in this Course, they establish sessions"). It also makes both vault-scoping (SC-008) and "planning persists nothing to the vault / doing produces one writeup" (SC-002) concrete, testable surfaces, and seeds the future F8 dashboard "Recent Sessions" tile without building it here.

**Alternatives rejected**: *Plan on the Daily Loop too* — puts the syllabus role on the daily surface; the Course is the natural home and keeps `/loop` focused on doing.

---

## R10 — `session_card_drafts` shape

**Decision**: `session_card_drafts(id, session_id → sessions ON DELETE CASCADE, front NOT NULL, back NOT NULL DEFAULT '', order_index INTEGER NOT NULL DEFAULT 0)` + `idx_session_card_drafts_session_id`. A new `SessionCardDraft` zod model.

**Rationale**: `front` required at plan time; `back` optional (filled while doing — default empty). `order_index` keeps the staged list stable. Cascade delete means removing a planned/completed session (or deleting a Course) cleans up drafts; finalize deletes them explicitly once materialized.

**Alternatives rejected**: *No `back` column* — the learner may stage a full prompt at plan time; allowing an empty default covers "front only, complete later."

---

## R11 — Abandon semantics differ by phase

**Decision**: Abandoning the **planning** form persists nothing (no planned session). Abandoning the **doing** flow leaves the session `planned` and persists none of the in-progress doing state (no pretest answers, no cards, no writeup).

**Rationale**: Planning is an explicit "save"; nothing is written until the learner saves the plan. Doing holds its transient state in memory and only commits on finish (R7), so leaving mid-way is clean and the plan survives for a later attempt — which also gives a lightweight "resume" (re-do the plan) without persisting half-done doing state.

**Alternatives rejected**: *Persist doing state incrementally* — reintroduces orphan/partial risk for a resume capability that is out of scope; the plan already provides the durable anchor.

---

## R12 — `finalizeSession` updates, not inserts

**Decision**: `finalizeSession(db, { sessionId, … })` **updates** the existing planned row (it does not create a session). It is given the `sessionId` of the plan being done.

**Rationale**: The session already exists from `planSession`; finish transitions its state. This also means the writeup short-id (derived from the existing session id) is known before doing, so the `writeup_path` can be precomputed for the deterministic retry (R7).

**Alternatives rejected**: *Insert a new completed row at finish* — would orphan the planned row and duplicate the session.
