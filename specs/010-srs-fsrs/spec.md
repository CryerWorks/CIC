# Feature Specification: Native FSRS Spaced Repetition (SRS)

**Feature Branch**: `010-srs-fsrs`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Native FSRS spaced repetition (SRS) — Phase 2 retention-engine core (PRD §F3). A fully native, in-app flashcard system so the user never leaves the platform to review. Core scheduling engine + full review UI + calibration (F3.5) + citations (F3.6 block-refs and F3.7 Resource citations), pulling forward a minimal Resource-registration path. No AI card generation, no cloze/image-occlusion (deferred)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review the due queue with spaced-repetition scheduling (Priority: P1)

The learner opens the Review screen and works through the cards that are due *today* for the currently-active vault. For each card they see the **front only**, attempt to recall the answer from memory, then reveal the back and grade how it went (Again / Hard / Good / Easy). The system reschedules the card — failed cards come back soon, easy cards move far out — and advances to the next due card until the queue is empty.

**Why this priority**: This is the heart of the retention engine and the headline of Phase 2. Without a working review loop driven by a real scheduling algorithm, nothing else in the SRS matters. It is the single slice that, alone, delivers the core value: durable retention through spaced retrieval. It replaces the user's external Anki dependency.

**Independent Test**: Seed a handful of cards with varied due dates under a connected vault, open the Review screen, and verify: only due cards appear; the answer stays hidden until revealed; each of the four grades reschedules the card sensibly (Again → soon, Easy → far out); every grading writes a review record; the queue empties as cards are graded.

**Acceptance Scenarios**:

1. **Given** three cards are due now and two are due next week, **When** the learner opens the Review screen, **Then** exactly the three due cards are presented and the future cards are not.
2. **Given** a card is showing its front, **When** the learner has not yet chosen to reveal, **Then** the back/answer is not visible anywhere on screen.
3. **Given** a revealed card, **When** the learner grades it "Again", **Then** the card's next due date is in the near future (sooner than a "Good" grade would produce) and a review record is logged.
4. **Given** a revealed card, **When** the learner grades it "Easy", **Then** the card's next due date moves substantially further out than "Good".
5. **Given** the last due card is graded, **When** the queue is exhausted, **Then** the screen shows an explicit "caught up / nothing due" state rather than an empty or broken grid.
6. **Given** cards exist in two different vaults, **When** the learner switches the active vault, **Then** the due queue re-scopes to the newly-active vault without an app restart.

---

### User Story 2 - Author cards manually (Priority: P2)

The learner creates a flashcard by hand: a front (prompt) and a back (answer), attached to a Course, and optionally tied to a Milestone, a source note in the vault, and/or a Project. They can edit a card's content later or delete it. Manually-authored cards flow straight into the due queue and the scheduling engine.

**Why this priority**: Cards have to come from somewhere, and AI card generation is deliberately out of scope until Phase 3. Manual authoring is how the user populates the SRS today, making the P1 review loop usable with their own material rather than only seed data.

**Independent Test**: From a connected vault with at least one Course, create a card with a front and back attached to that Course; verify it persists, enters the due queue as a new card, can be edited (content changes stick), and can be deleted (it leaves the queue and its review history is removed with it).

**Acceptance Scenarios**:

1. **Given** a connected vault with a Course, **When** the learner creates a card with a front and back on that Course, **Then** the card is saved and becomes available for review.
2. **Given** an existing card, **When** the learner edits its front or back, **Then** the updated content is shown on the next review without disturbing its scheduling state.
3. **Given** an existing card, **When** the learner deletes it, **Then** it is removed from the due queue and its review history is removed with it.
4. **Given** the learner is creating a card, **When** they optionally select a Milestone, source note, or Project, **Then** those links are saved with the card.

---

### User Story 3 - Calibrate confidence on each review (Priority: P3)

Alongside the recall grade, on each review the learner also records how confident they felt (a 1–5 rating). Over time the dashboard surfaces **overconfident cards** — ones the learner felt sure about but actually failed — concentrating attention where the illusion of competence hides.

**Why this priority**: Calibration is the metacognitive layer that turns review from rote repetition into accurate self-knowledge. It depends on the P1 review loop existing but adds distinct, independently demonstrable value (knowing *what you wrongly think you know*).

**Independent Test**: Review several cards, recording a confidence rating on each; grade at least one high-confidence card as "Again"; verify the confidence is stored with the review and that the dashboard lists that card among "overconfident."

**Acceptance Scenarios**:

1. **Given** a revealed card, **When** the learner grades it, **Then** they are able to record a confidence rating from 1 to 5 for that review.
2. **Given** a card graded "Again" with a confidence of 5, **When** the learner later views the dashboard, **Then** that card appears in the overconfident surface.
3. **Given** a card graded "Good" with a confidence of 4, **When** the dashboard is viewed, **Then** that card does NOT appear as overconfident.

---

### User Story 4 - Register Resources and cite the source of a card (Priority: P4)

The learner manages a registry of **Resources** — the books, PDFs, videos, web pages, and other sources they study — on a dedicated screen, recording kind-appropriate metadata and linking each to the relevant Courses. When authoring or refining a card, they attach **citations** so the card carries a breadcrumb back to where the knowledge came from: one or more registered Resources each with an optional locator (page, timestamp, anchor), and/or a block-level reference into a processed note in the vault. On review, the citations are shown and the learner can jump back to the exact source location.

**Why this priority**: Citations close the "where did I learn this?" loop and set up the Resource ↔ Card chain the later Daily Loop and Resources features build on. It is the richest but least-blocking slice — the review loop, authoring, and calibration all work without it — so it sits last while still being in this feature's committed scope.

**Independent Test**: Register a Resource by kind with its metadata and link it to a Course; attach that Resource with a locator to a card; on review, verify the citation is displayed and offers a best-effort jump to the Resource at its locator. Separately, attach a block reference to a vault note and verify a stable block-id marker is written into that note through the vault writer, idempotently (re-running does not duplicate markers).

**Acceptance Scenarios**:

1. **Given** a registered Resource linked to a Course, **When** the learner attaches it to a card with a locator and saves, **Then** the citation is stored and shown when the card is reviewed.
2. **Given** a card citing a Resource, **When** the learner activates the citation during review, **Then** the system attempts to open that Resource at its locator (best-effort per Resource kind) and degrades gracefully if it cannot.
3. **Given** a card citing a vault note via a block reference, **When** the citation is created, **Then** a stable block-id marker is inserted into that note through the vault writer only, and re-creating the same citation does not add a duplicate marker.
4. **Given** the learner needs a source that is not yet registered, **When** they register it on the Resources screen by kind with its metadata and link it to a Course, **Then** it becomes available to cite on cards.
5. **Given** an existing Resource, **When** the learner edits its metadata or deletes it, **Then** the change is reflected wherever it is cited (and a delete removes its citations without orphaning cards).

---

### Edge Cases

- **Nothing due / no cards at all**: the Review screen shows a calm "caught up" or onboarding state, never a fabricated card or broken layout.
- **No vault connected**: the SRS screens gate on a connected vault (consistent with the Domains/Courses screens) rather than showing another vault's cards.
- **Switching vault mid-session**: the due queue and authoring re-scope to the new active vault without a restart; the prior vault's cards reappear on switching back, losslessly.
- **Brand-new card**: a never-reviewed card enters scheduling cleanly and its first appearance follows the new-card introduction policy (see clarifications).
- **Course/Domain deletion**: deleting the parent Course or Domain cascades to its cards and their reviews/citations — no orphaned cards or reviews remain.
- **Corrupt or missing scheduling state**: a card whose stored scheduling state is malformed or absent is treated as a fresh card and re-initialized rather than crashing the queue.
- **Cited Resource moved/missing**: the deep-link is best-effort; a missing file or unreachable URL shows the locator text and a graceful message instead of erroring.
- **Cited note open in Obsidian / externally edited**: inserting a block-id marker honors the never-clobber rule — if the note has drifted, the write surfaces a conflict rather than overwriting unsaved external edits.
- **Same card reviewed twice in a day**: each review is logged independently; the schedule advances per the most recent grade.
- **Reviewing while the underlying note was renamed/deleted in the vault**: the card still reviews from its stored front/back; a broken note link degrades gracefully.

## Requirements *(mandatory)*

### Functional Requirements

**Scheduling engine**

- **FR-001**: System MUST schedule every card using the FSRS algorithm (the product-locked spaced-repetition algorithm per PRD §F3), persisting each card's scheduling state and next due date.
- **FR-002**: On each graded review, System MUST update the card's scheduling state and next due date according to FSRS and the grade given.
- **FR-003**: System MUST record every review as an immutable history entry capturing at least the card, the grade, the timestamp, the time spent, and the confidence rating.
- **FR-004**: System MUST compute a due queue consisting of only the cards whose next due date is at or before the current moment, for the active vault.

**Review experience**

- **FR-005**: The review flow MUST enforce retrieval-before-reveal — the answer/back of a card MUST remain hidden until the learner explicitly reveals it.
- **FR-006**: After revealing, the learner MUST be able to grade the card on the four FSRS grades (Again / Hard / Good / Easy).
- **FR-007**: After a grade is recorded, System MUST advance to the next due card and reflect the updated schedule.
- **FR-008**: When the due queue is empty, System MUST present an explicit "caught up / nothing due" state with no fabricated cards.

**Authoring**

- **FR-009**: Learners MUST be able to create a card with a front and a back, attached to a Course.
- **FR-010**: Learners MUST be able to optionally associate a card with a Milestone, a source-note path in the vault, and/or a Project at authoring time.
- **FR-011**: Learners MUST be able to edit a card's front/back and delete a card; editing content MUST NOT reset the card's scheduling state.
- **FR-012**: A newly created card MUST enter the scheduling system as a new (never-reviewed) card that is **immediately due**. The number of *new* cards introduced into the review queue per day MUST be limited by a **configurable daily new-card cap** (default 20); new cards beyond the cap wait for a subsequent day rather than flooding the queue.

**Calibration (F3.5)**

- **FR-013**: On each review, System MUST let the learner record a confidence rating from 1 to 5, captured alongside the FSRS grade.
- **FR-014**: System MUST surface "overconfident" cards — those most recently reviewed with high confidence yet a failing ("Again") grade — on the dashboard.

**Citations (F3.6 block-refs + F3.7 Resource citations)**

- **FR-015**: Learners MUST be able to cite one or more Resources on a card, each with an optional locator (e.g., page, timestamp, anchor).
- **FR-016**: The citation editor MUST let the learner add or remove Resource citations and refine each locator before saving the card.
- **FR-017**: On review, System MUST display a card's citations and offer a best-effort jump to each cited Resource at its locator, degrading gracefully when the source is unavailable.
- **FR-018**: Learners MUST be able to cite a vault note via a block-level reference; System MUST insert a stable, deterministic block-id marker into that note through the vault writer only, idempotently across repeats, and honoring the never-clobber rule.
- **FR-019**: System MUST provide a dedicated Resource registry: a screen to register a Resource of any of the 8 kinds with kind-appropriate metadata (e.g., author/ISBN for books, URL for web pages and video URLs, duration for video/audio, file path for PDFs/EPUBs/Markdown), to edit and delete Resources, and to link them to Courses. This front-runs the registration half of the separate Resources feature; that later feature covers session assignments (F2.3) and AI ingestion (F10.2), not basic registration.

**Scoping, integrity & guardrails**

- **FR-020**: All card reads and writes MUST be scoped to the active vault; switching the active vault MUST re-scope the due queue and authoring views without an app restart, consistent with the established vault-as-data-boundary behavior.
- **FR-021**: System MUST handle a malformed or absent scheduling state gracefully by re-initializing the card, never crashing the review queue.
- **FR-022**: System MUST store only the card front/back as knowledge content outside the vault; it MUST NOT store note or MOC bodies (the tracking/knowledge boundary).
- **FR-023**: A card MUST be counted as "engaged"/"learned" only as a result of an actual review, never upon creation or any generated action.
- **FR-024**: Deleting a Course or Domain MUST cascade to remove its cards and each card's review history and citations, leaving no orphaned records.
- **FR-025**: The review session MUST run from a dedicated top-level **Review** navigation screen presenting the vault-wide due queue across all Courses; **card authoring and per-card listing MUST live on the Course detail screen** (cards belong to a Course). The Resource registry (FR-019) is its own screen.

### Key Entities *(include if feature involves data)*

- **Card**: A flashcard with a front (prompt) and back (answer). Belongs to exactly one Course; optionally linked to a Milestone, a source note in the vault, and/or a Project. Carries its scheduling state and next due date.
- **Review**: An immutable record of one review event for a card — the grade, the confidence rating, the timestamp, and the time spent. Many reviews accumulate per card and form the calibration and history signal.
- **Scheduling state**: The per-card state the FSRS algorithm reads and updates to compute the next due date. Opaque to the rest of the app; owned by the scheduling engine.
- **Resource**: A reference source the learner studies (book, PDF, EPUB, video file, video URL, web page, audio, Markdown). For this feature, registerable with a kind and basic metadata and linkable to a Course; the full Resources experience is a separate feature.
- **Card citation (to a Resource)**: A many-to-many link from a card to a Resource with an optional locator, giving the breadcrumb back to the original source.
- **Block reference (to a note)**: A citation from a card to a specific paragraph in a vault note, backed by a stable block-id marker written into that note.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner can review a due card — recall, reveal, grade — and see the next due date update, in a single uninterrupted flow taking only a few seconds per card.
- **SC-002**: Scheduling behaves monotonically by grade: across a set of reviews, a card graded "Again" is always rescheduled sooner than the same card graded "Good", which is sooner than "Easy".
- **SC-003**: 100% of grades produce a logged review record — no review is silently lost.
- **SC-004**: The due queue contains only the active vault's cards; switching the active vault changes the visible queue with no restart, and switching back restores the prior vault's cards intact.
- **SC-005**: After reviewing, a learner can identify every card they were overconfident about (high confidence but failed) from the dashboard.
- **SC-006**: For at least the common Resource kinds, activating a card's citation opens the source at its locator (e.g., a PDF at the cited page); for kinds that cannot be auto-opened, the locator is shown so the learner can navigate manually — with no error in either case.
- **SC-007**: No card is ever shown as "learned" or counted toward retention without at least one real review having occurred.
- **SC-008**: A learner can create a card and have it appear in the review queue within a few simple steps, with no external tool involved.

## Assumptions

- **Scheduling algorithm is FSRS**, a product-locked decision (PRD §F3 / §13); the specific implementation library and its default parameters are a planning concern. Default request-retention and weights use the algorithm's standard defaults for V1; per-user tuning of FSRS parameters is out of scope for this feature.
- **The platform is the sole home for review** — no Anki dependency, no review elsewhere. One-way Anki export remains a future, non-V1 concern.
- **The tracking schema already exists**: the data model for cards, reviews, Resources, and card-to-Resource citations was established in the data-layer feature; this feature builds engines and UI on top of it and is not expected to require new core tables (additive query/command functions only).
- **Vault scoping is inherited**: cards belong to a Course, which belongs to a Domain, which is scoped to a vault; the active-vault data boundary from the vault-scoped-data feature applies transitively.
- **Fuller Resource registry included**: this feature builds a dedicated Resource registry (all 8 kinds, per-kind metadata, CRUD, Course links) to make citations first-class. The separate Resources feature then covers session assignments (F2.3) and AI ingestion (F10.2) — basic registration is no longer its responsibility.
- **New-card cap**: new cards are immediately due, throttled by a configurable daily new-card cap (default 20). This introduces a small settings surface for that limit.
- **No AI in this feature**: AI-drafted cards, retrieval quizzes, and the Feynman tutor are Phase 3 and explicitly excluded here.
- **Advanced card types excluded**: cloze-deletion and image-occlusion card types are deferred; V1 cards are front/back only.
- **Single-user, fully local**: no accounts, no sync, no telemetry — consistent with the platform's non-negotiable local-only guardrail.

## Out of Scope

- AI card generation / AI drafting, retrieval-practice quizzes (F5), and the Feynman/Socratic tutor (F4) — Phase 3.
- Cloze-deletion and image-occlusion card types — a later enhancement.
- One-way Anki export — future, optional, never a workflow split.
- The Daily Loop session flow (F2), native notifications (F9), Projects (F11), and the interleaving/desirable-difficulty scheduler (F6) — separate features.
- Resource **session assignments** (F2.3) and **AI ingestion** (F10.2) — the remainder of the Resources feature, after this feature's registry.
- User-configurable FSRS parameters / per-deck scheduling tuning.

## Dependencies

- SQLite data layer + migrations (Feature 003) — `cards`, `reviews`, `resources`, `course_resources`, `card_resources` tables.
- VaultReader/VaultWriter spine (Feature 005) — block-id marker insertion through the single sanctioned write path.
- Courses ↔ MOC (Feature 007) — cards attach to Courses; optional links to notes/milestones.
- Command Center Dashboard (Feature 008) — surfaces due-card count and the overconfident-cards calibration view.
- Vault-scoped data (Feature 009) — the active vault is the data boundary; SRS reads scope through it.
