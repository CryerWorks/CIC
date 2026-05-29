# Feature Specification: The Daily Loop (plan a session, then do it)

**Feature Branch**: `012-daily-loop`

**Created**: 2026-05-29 · **Revised**: 2026-05-29 (two-phase model)

**Status**: Draft

**Input**: User description: "The Daily Loop — a first-class, step-guided learning session (PRD F2), Phase 2 (no AI provider configured; AI-dependent steps are present but manual/skippable, wired in Phase 3). It orchestrates the evidence-based protocol and ties together the Course/Milestone/Resource/Card pieces already built (Features 007–011)."

> **Revision note (2026-05-29).** The first cut conflated *configuring* a session with *doing* it: the learner authored the objective, assignments, pretest questions and cards inline in one sitting, then "finished." That is backwards. Just like a real course, a session is **established ahead of time** (the syllabus: what to study, the questions to attempt, the cards to make) and the learner later **goes through it** — doing the reading, attempting the pretest, recalling, explaining, completing the cards. This spec splits the loop into a **planning phase** and a **doing phase**.

## Overview

The Daily Loop is the app's central daily-use surface. It has two phases:

1. **Plan a session** (inside a Course). The learner establishes a session up front — a capability-phrased objective, the resource **assignments** to study (with locators), the **pretest questions** to attempt cold, and the **intended card prompts** to make. The session is saved as **planned**.
2. **Do a session** (the guided flow). Later, the learner picks a planned session and works the evidence-based protocol: attempt the pretest from intuition → study the pre-assigned sources (opened at their locators) → recall from memory → capture an atomic note → self-test → complete the planned cards → finish. On finish the session is recorded as **completed** and a human-readable writeup note is written into the vault.

This feature delivers both phases **without any AI**. Steps slated for AI later (AI-generated pretest questions, the Feynman/Socratic examiner, AI-drafted cards) are **manual**: the learner authors them at plan time and engages with them at do time. The AI is layered into the same shapes in Phase 3.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plan a study session in a Course (Priority: P1)

From a Course, the learner establishes a session: states a capability-phrased objective (optionally seeded from a Milestone), attaches the resource assignments to study (each a Resource + kind + locator), writes the 2–4 pretest questions to attempt, and stages the intended card prompts. Saving creates a **planned** session that appears in the Course's planned-sessions list and in the Daily Loop.

**Why this priority**: This is the "syllabus" half of the loop and a prerequisite for doing a session. Establishing the session ahead of time is the core realization of this revision.

**Independent Test**: On a Course, plan a session with an objective, one PDF assignment at a locator, two pretest questions, and one card prompt; confirm a **planned** session is persisted with its assignments, pretest questions, and card drafts, and that it appears in the planned list.

**Acceptance Scenarios**:

1. **Given** a Course with a Milestone, **When** the learner picks that Milestone while planning, **Then** its capability statement is offered as the editable objective seed.
2. **Given** the planning form, **When** the learner adds assignments / pretest questions / card prompts and saves, **Then** a **planned** session is persisted with all of them as children, and **no** writeup is written and **no** cards enter the review queue yet.
3. **Given** an empty objective, **When** the learner tries to save the plan, **Then** the system requires an objective before saving.
4. **Given** a planned session, **When** the learner deletes it before doing it, **Then** it and its children are removed and nothing leaks into the review queue or the vault.

---

### User Story 2 - Do a planned session and record it (Priority: P1)

From the Daily Loop, the learner sees their planned sessions, picks one, and works through the guided steps — attempt pretest → active study → retrieve from memory → atomic note → self-test → complete cards → finish. On finish the session is marked **completed**, its pretest answers and cards are saved, and exactly one writeup note appears in the vault.

**Why this priority**: This is the "doing" half — the daily ritual whose durable output is a session record plus a vault writeup. Together with US1 it is the MVP.

**Independent Test**: Take a planned session, do it (write a recall scratchpad and an atomic note, complete the staged card), finish; confirm the session flips to **completed**, a `type: log` writeup note exists in the vault containing the objective and captured content, and the session shows in the recent-completed list.

**Acceptance Scenarios**:

1. **Given** a planned session in the active vault, **When** the learner opens it in the Daily Loop, **Then** the doing flow is pre-loaded with that session's objective (read-only), assignments, pretest questions, and card prompts.
2. **Given** the doing flow, **When** the learner advances through the steps and finishes, **Then** the session is updated to **completed** and exactly one Markdown writeup note is written to the vault.
3. **Given** the retrieve-from-memory step, **When** it is shown, **Then** no source content or "answer" is pre-revealed — the scratchpad starts empty (retrieval before reveal).
4. **Given** a learner who abandons the doing flow mid-way, **When** they leave, **Then** the session **remains planned** (re-doable later) and nothing partial is persisted (no answers, no cards, no writeup).

---

### User Story 3 - Open the pre-assigned sources at the right place (Priority: P2)

During the active-study step of a planned session, the learner sees the assignments chosen at plan time and opens each Resource at its locator, landing at the cited page/timestamp on a best-effort basis.

**Why this priority**: This is what makes a session *connected* to real material. It builds on the Resource registry and best-effort deep-linking (Features 010/011) and is required by the PRD §12 Phase-2 milestone.

**Independent Test**: Do a planned session whose assignment references a PDF at `page=10`; click open during active study and confirm the PDF opens at page 10 (best-effort); confirm a non-openable kind (physical book) shows its locator as text instead.

**Acceptance Scenarios**:

1. **Given** a planned assignment for a PDF with a page locator, **When** the learner opens it during active study, **Then** the source opens at the cited page on a best-effort basis.
2. **Given** an assignment for a physical book or other non-openable kind, **When** the learner views it, **Then** the locator is shown as text and no failed-open occurs.
3. **Given** a video assignment with a `mm:ss-mm:ss` range locator, **When** opened, **Then** it opens at the **start** of the range (e.g. `10:30-15:30` → 10m30s), not the first integer.

---

### User Story 4 - Planned cards become cited review cards (Priority: P2)

The card prompts staged at plan time are completed during doing (the learner fills in the back / answer) and, on finish, become **new** SRS cards. Each card is automatically cited to the session's studied Resources at their locators (inherited from the assignments), and the cards join the normal review queue as new.

**Why this priority**: Converting a planned session into durable, source-cited retrieval practice is the payoff that connects the loop to the spaced-repetition engine (PRD F3.7).

**Independent Test**: Do a planned session that has one PDF assignment and one staged card prompt; complete the card and finish; confirm the card exists citing that PDF at its locator without manual re-entry, and that it appears as **new** in the review queue.

**Acceptance Scenarios**:

1. **Given** a planned session with assignments and a staged card prompt, **When** the session finishes, **Then** the resulting card cites the session's Resources (deduped to one citation per resource, first locator wins) without manual re-entry.
2. **Given** a card materialized on finish, **When** the review queue is consulted, **Then** the card appears as **new** and is not marked reviewed or learned.
3. **Given** a planned session with no assignments, **When** a staged card is finished, **Then** a card is still created (with no citations).

---

### User Story 5 - Prime learning with the planned pretest (Priority: P3)

During doing, before opening any source, the learner attempts the 2–4 pretest questions established at plan time, from intuition or prior knowledge. Answers are recorded — never graded — and surfaced in the writeup as a "what I thought vs what's true" comparison.

**Why this priority**: Pretesting (errorful generation) is a strong mechanism, but the loop is valuable without it, so it layers on top. It is also the step most clearly slated for AI generation later, so a manual version proves the shape.

**Independent Test**: Plan a session with two pretest questions; do the session, attempt the questions, finish; confirm the attempts appear verbatim in the writeup with no correct/incorrect scoring; a session planned with no pretest omits the section.

**Acceptance Scenarios**:

1. **Given** a planned session with pretest questions, **When** the learner attempts them during doing, **Then** the responses are stored against the session without being graded or scored.
2. **Given** recorded pretest attempts, **When** the session finishes, **Then** the writeup includes the question + attempt for the learner's own reflection.
3. **Given** a session planned with no pretest questions, **When** it is done, **Then** the flow proceeds normally and the writeup omits the pretest section.

---

### Edge Cases

- **No Resources registered**: planning shows guidance (how to register/link a Resource) and a session is still plannable + doable with zero assignments.
- **A Resource referenced by a planned assignment is deleted before doing**: the assignment's reference is removed (existing FK cascade); active study and the writeup gracefully show what remains.
- **Vault unavailable/locked at finish**: the session record is still saved as **completed**; the writeup failure is surfaced with a retry rather than crashing or losing the session.
- **Writeup/note filename collides with an existing vault file**: the conflict is surfaced and the existing file is never clobbered.
- **Locator can't be honored by any viewer**: the locator is displayed as text; no silent failure.
- **Learner abandons the planning form**: nothing is persisted (no planned session created).
- **Learner abandons the doing flow**: the session stays **planned** and re-doable; no partial answers/cards/writeup.
- **Switching the active vault**: only the current vault's planned and completed sessions are visible.

## Requirements *(mandatory)*

### Functional Requirements

**Planning a session (US1)**

- **FR-001**: Users MUST be able to plan a session against a specific Course in the active vault, persisted as a **planned** session.
- **FR-002**: Users MUST enter a capability-phrased objective to save a plan; when a Milestone of the Course is selected, the system MUST offer that Milestone's capability statement as an editable seed. (v1 does not persist a `milestone_id` — the objective text is the durable record; see Assumptions.)
- **FR-003**: Users MUST be able to add 0..N assignments to the plan, each referencing a registered Resource in the active vault, an assignment kind (read / watch / listen / review), and a free-form locator.
- **FR-004**: Users MUST be able to add 0..N pretest **questions** to the plan (no answers at plan time).
- **FR-005**: Users MUST be able to stage 0..N intended **card prompts** (a required front; an optional back to be completed while doing).
- **FR-006**: The system MUST persist a planned session together with its assignments, pretest questions, and card drafts atomically; planning MUST NOT write any vault note or create any review card.
- **FR-007**: Users MUST be able to see a Course's planned sessions and delete a planned session (removing its children) before doing it.

**Doing a session (US2)**

- **FR-008**: The Daily Loop MUST list the active vault's **planned** sessions and let the user start (do) one; with none planned, it MUST show guidance linking to a Course.
- **FR-009**: Starting a planned session MUST pre-load the doing flow from the plan: objective (read-only), assignments, pretest questions, and card prompts.
- **FR-010**: The doing flow MUST be an ordered, step-guided sequence (pretest → active study → retrieve from memory → atomic note → self-test → complete cards → finish) and MUST allow moving forward and revisiting earlier steps within the session.
- **FR-011**: Steps with no planned content (e.g. no pretest questions, no assignments, no card prompts) MUST be skippable / pass-through so the session can be completed.
- **FR-012**: On finishing, the system MUST update the session to **completed** and persist its elapsed minutes, retrieval flag, pretest answers, and the writeup path.

**Active study & deep-linking (US3)**

- **FR-013**: During active study, the system MUST list the planned assignments and let the user open each Resource at its locator using the existing best-effort deep-link behavior.
- **FR-014**: When a Resource/locator cannot be auto-opened, the system MUST display the locator as text rather than failing silently.
- **FR-015**: A video range locator (`mm:ss-mm:ss`) MUST resolve to the start of the range.

**Retrieval & note capture (US2)**

- **FR-016**: The system MUST provide a retrieval scratchpad presented before re-opening sources and MUST NOT pre-fill it with source content or answers; a non-empty scratchpad sets the session's retrieval flag.
- **FR-017**: Users MUST be able to author an atomic note written into the vault as clean, human-readable Markdown supporting `[[wikilinks]]`.
- **FR-018**: The system MUST write all notes and the writeup only through the sanctioned vault-writing path (atomic, never-clobber) and MUST surface a conflict instead of overwriting an externally-changed or pre-existing file.

**Self-test (US2)**

- **FR-019**: The system MUST provide a manual self-test/explanation step (placeholder for the future AI Feynman panel) that captures the learner's explanation for the writeup and MUST NOT grade or score it.

**Completing cards (US4)**

- **FR-020**: During doing, users MUST be able to complete the staged card prompts (edit front, fill the back) and MAY add additional cards.
- **FR-021**: On finish, each completed card MUST be created as a **new** SRS card whose resource citations are pre-populated from the session's assignments (resource + locator), **deduped to one citation per resource** (first locator wins).
- **FR-022**: Materialized cards MUST enter the existing review queue as **new** cards; the session MUST NOT mark any card as reviewed or learned.

**Pretest (US5)**

- **FR-023**: During doing, users MUST be able to attempt the planned pretest questions; responses MUST be stored and MUST NOT be graded, scored, or marked correct/incorrect.
- **FR-024**: The session writeup MUST surface the pretest questions and attempts for the learner's own "what I thought vs what's true" reflection.

**Finish, logging & writeup (US2)**

- **FR-025**: On finishing, the system MUST write a human-readable Markdown session writeup note into the vault, identifiable as a session log (`type: log`), including the objective, the pretest comparison (if any), what was studied, what was recalled, the self-test/gaps, and the cards made.
- **FR-026**: If the vault write fails at finish, the session MUST remain saved as **completed** and the failure MUST be surfaced with a way to retry the writeup, rather than crashing or losing the session.

**Guardrails & scoping**

- **FR-027**: The feature MUST function fully offline with no network calls and with no AI provider configured; AI-dependent steps appear only as manual placeholders.
- **FR-028**: The system MUST NOT automatically mark a Course, Milestone, Card, or Note as "learned" or "mastered" as a result of planning or completing a session.
- **FR-029**: Planned and completed sessions and their child records MUST be scoped to the active vault; switching vaults MUST show only that vault's sessions.
- **FR-030**: Abandoning the planning form MUST persist nothing; abandoning the doing flow MUST leave the session **planned** with no partial answers, cards, or vault files.

### Key Entities *(include if feature involves data)*

- **Session**: a unit of study within a Course. Has a **status** (`planned` → `completed`), an objective, timestamps (planned date + completion time), elapsed minutes, a retrieval flag, and a writeup path (set on completion). Vault-scoped transitively via its Course's Domain.
- **Session Assignment**: a study task in a session — a Resource reference, an assignment kind (read / watch / listen / review), and a free-form locator (e.g., `p.10-15`, `00:15:30-00:23:45`, `#section-3`). Established at plan time.
- **Pretest Question/Response**: a question established at plan time; the learner's response is filled while doing. Never scored.
- **Session Card Draft**: an intended card prompt (front + optional back) staged at plan time; materialized into a real **new** SRS card on finish, then removed.
- **Session Writeup** (vault Markdown note): the human-readable record of a completed session, written to the vault on finish (a session log).
- **Referenced existing entities**: Course, Milestone, Resource (+ `card_resources`), Card (+ review queue), atomic Notes — reused from Features 005–011.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner can plan a session in a Course and later complete it from the Daily Loop, ending with a vault writeup, without leaving the app.
- **SC-002**: Planning persists exactly one **planned** session (with its children) and writes nothing to the vault and no review cards; finishing produces exactly one **completed** record and exactly one writeup note.
- **SC-003**: The full plan→do round trip works with **no AI provider configured** — every step has a working manual path.
- **SC-004**: When a PDF assignment with a page locator is opened during active study, the learner reaches the cited page on a best-effort basis; a `mm:ss-mm:ss` video range opens at the start.
- **SC-005**: A staged card finished in a session that has a resource assignment is created already citing that resource at its locator, with zero manual citation re-entry, deduped to one citation per resource.
- **SC-006**: No action within planning or doing marks any card or note as learned/reviewed; materialized cards appear as **new** in the review queue.
- **SC-007**: Pretest attempts are never shown as correct/incorrect or scored, and appear verbatim in the writeup.
- **SC-008**: Session data (planned and completed) is isolated per vault — switching the active vault shows only that vault's sessions.
- **SC-009**: Writing notes/writeups never overwrites or corrupts an existing vault file; conflicts are surfaced for the learner to resolve.
- **SC-010**: Abandoning the doing flow leaves the session re-doable as **planned**, with no orphaned cards or vault files.

## Assumptions

- **Planning persists; doing is single-sitting (v1)**: a planned session is durable (it can be done later, across restarts). The *doing* phase's in-progress state (answers, scratchpads, note body) is held in memory and persisted only on finish; resuming a half-done session after leaving the doing flow is out of scope — the session simply remains **planned**.
- **Milestone is objective-seed-only (v1)**: selecting a Milestone seeds the editable objective text but is not stored as a session field (no `sessions.milestone_id` — the same deferred §8 decision as cards in Feature 010). The objective text is the durable record.
- **Card citations inherit the whole session's assignments (v1)**: a materialized card cites every Resource the session assigned (deduped). Per-card citation selection is a later enhancement; the existing card-detail citation editor can refine citations after the fact.
- **Writeup location & naming**: writeups go to a `Sessions/` folder, named by date + objective + a short session id, following existing vault note conventions.
- **Plain-Markdown note editing**: the note and scratchpad steps use plain Markdown text entry; rich/WYSIWYG editing is not required for v1.
- **Planning lives on the Course**: the planning surface is on the Course-detail screen (alongside its cards); the Daily Loop is the doing surface. This matches "in this course, they establish sessions."
- **Reuse of existing capabilities**: the Resource registry and best-effort deep-linking (Features 010/011), card authoring + FSRS review queue (Feature 010), the vault read/write spine (Feature 005), and active-vault data scoping (Feature 009) are reused as-is.

## Out of Scope

- AI generation of pretest questions; the AI Feynman/Socratic panel (F4); AI-drafted cards; retrieval-practice quizzes (F5).
- Interleaving-scheduler seeding of assignments and daily-mix suggestions (F6) — planning is manual here; F6 will later seed plans.
- Project work-blocks (linking a session to a Project — F11 Projects is not yet built).
- Embedded/in-app viewers (external viewer launch only); RAG ingestion (Phase 3).
- Resuming a half-done **doing** session across app restarts (the plan persists; the in-progress doing state does not).
