# Feature Specification: Projects — Applied Practice (MVP)

**Feature Branch**: `015-projects-mvp`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Projects MVP (PRD F11, Phase 2, manual — NO AI). The applied-practice artifact that closes the knowledge→application gap…"

## Overview

A **Project** is a concrete problem the learner solves using one or more Milestones' worth of capability from a single Course. It is the unit of *application* — the missing pillar in a study system that otherwise only reinforces *acquisition* (retrieval, spacing, elaboration). Projects close the knowledge→application gap.

This MVP is **fully manual and contains no AI**: the learner authors a Project, does the work, reflects, and decides what (if anything) to carry forward into spaced-repetition. Projects are **optional** per Course — a Course may have zero Projects forever. Each Project lives as a plain-Markdown file in the learner's Obsidian vault (the canonical store) with a small fixed frontmatter (the integration layer the app queries) and a freeform, domain-shaped body the learner owns.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author a Project on a Course (Priority: P1)

From a Course's detail screen, the learner creates a Project: a title, at least one of the Course's Milestones it exercises, and a one-sentence **capability statement** ("what does completing this prove I can do?"). They may optionally add more Milestones, choose a starting **template** (`math/proof`, `cs/implement`, or `freeform`), write an opening problem framing, and reference specific **Resources** with a locator (e.g. "Strang, Ch. 3"). Saving the Project writes a clean Markdown file into the vault and lists the Project under the Course.

**Why this priority**: This is the minimal viable slice. Capturing an applied-practice intention tied to real Milestones — and having it appear as a readable file in the vault — delivers value on its own, even before any lifecycle or retention wiring exists. Everything else builds on a Project existing.

**Independent Test**: With a vault connected and a Course that has Milestones, create a Project with a title, one Milestone, and a capability statement; confirm it appears in the Course's Projects list and that a corresponding, human-readable Markdown file exists in the vault with the expected frontmatter.

**Acceptance Scenarios**:

1. **Given** a Course with at least one Milestone, **When** the learner creates a Project with a title, one Milestone, and a capability statement, **Then** the Project appears under the Course and a Markdown file is written to the vault with `type: project` frontmatter capturing the title, course, milestone(s), capability, `status: open`, and opened date.
2. **Given** the Project creation form, **When** the learner tries to save without a title, without any Milestone, or without a capability statement, **Then** saving is blocked and the missing requirement is indicated.
3. **Given** the Project creation form, **When** the learner picks a template, **Then** the new file's freeform body starts from that template's headings; choosing a different template (or none) changes only the starting body, never what makes the Project valid.
4. **Given** a Project references a Resource with a locator, **When** the Project is saved, **Then** that Resource reference is recorded against the Project and shown on the Project.
5. **Given** the Milestone picker, **When** the learner browses Milestones, **Then** only the Project's own Course's Milestones are offered.

---

### User Story 2 - Work a Project and close it with a reflection (Priority: P2)

The learner advances a Project through its lifecycle: it starts `open`, becomes `in-progress` when work has touched it (including planning a Daily-Loop session against it), and is eventually **closed** — either `complete` (claiming the capability) or `abandoned` (set down without that claim, treated as neutral, not failure). Closing prompts a short reflection ("what did you have to look up? what was hard?"), and from those answers the learner **may choose** to spawn spaced-repetition cards — always reviewed and approved by the learner, never created automatically.

**Why this priority**: This is the slice that actually closes the loop between application and retention. It turns a Project from a static note into a driver of future practice — but only through deliberate learner engagement, preserving desirable difficulty.

**Independent Test**: Given an existing `open` Project, plan (or mark) a session against it and confirm it moves to `in-progress`; then close it as `complete`, enter a reflection, choose to spawn one card, and confirm a new card linked to the Project enters the review queue while nothing was auto-marked as mastered.

**Acceptance Scenarios**:

1. **Given** an `open` Project, **When** a Daily-Loop session is planned that targets it (or the learner advances it manually), **Then** the Project's status becomes `in-progress`.
2. **Given** an `in-progress` Project, **When** the learner closes it as `complete`, **Then** its status becomes `complete`, a closed date is recorded, and the reflection is captured.
3. **Given** an `in-progress` Project, **When** the learner closes it as `abandoned`, **Then** its status becomes `abandoned` with a closed date, presented as a neutral outcome (no failure framing, no penalty).
4. **Given** the close-reflection step, **When** the learner writes reflection answers and selects items to turn into cards, **Then** only the selected items become cards, each linked to the Project, and they appear in the review queue.
5. **Given** the close-reflection step, **When** the learner declines to spawn any cards, **Then** the Project closes with no cards created.
6. **Given** any Project at any stage, **When** the learner reviews it, **Then** nothing in the system has graded, scored, or auto-marked the work as correct or mastered.

---

### User Story 3 - Round-trip with the vault and surface active Projects (Priority: P3)

Because the vault is canonical, a Project authored or edited directly in Obsidian must be honored. On rescan, the app imports Project files (by their `type: project` frontmatter), reconciling them with what it tracks. Active Projects surface on the dashboard per Domain so the learner sees applied practice in flight. Deleting a Project always removes the app's tracking but never silently destroys the vault file — the learner chooses whether to **detach** the file (leave it, stop tracking it) or **delete the file too** (an explicit, confirmed action).

**Why this priority**: This makes Projects first-class vault citizens rather than app-only records, and gives them visibility in the learner's daily landing view. It's essential for trust ("the app won't eat my notes") but depends on authoring (P1) and lifecycle (P2) existing first.

**Independent Test**: Create a valid Project Markdown file directly in the vault (outside the app), run a rescan, and confirm it appears in-app with its milestones, capability, and status intact; then delete a Project in-app, choose "detach", and confirm the file remains but is no longer re-imported.

**Acceptance Scenarios**:

1. **Given** a `type: project` Markdown file present in the vault but unknown to the app, **When** the learner rescans, **Then** the Project is imported with its capability, milestone references, and status.
2. **Given** a tracked Project whose vault file was edited in Obsidian, **When** the learner rescans, **Then** the app reflects the external edits without overwriting the learner's freeform body.
3. **Given** the dashboard, **When** the learner has active (`open`/`in-progress`) Projects, **Then** they are shown grouped by Domain with a way to navigate to the Project's Course/Project; a learner with no active Projects sees no fabricated entries.
4. **Given** a tracked Project, **When** the learner deletes it and chooses "detach", **Then** the app's records are removed, the vault file remains, and a subsequent rescan does not re-import it.
5. **Given** a tracked Project, **When** the learner deletes it and chooses "delete the file too" and confirms, **Then** the vault file is removed through the sanctioned delete path; if the file changed since the app last wrote it, the learner is warned and must confirm again before deletion proceeds.

---

### Edge Cases

- **Course has no Milestones**: Project authoring requires at least one Milestone; if the Course has none, the learner is guided to add a Milestone first rather than being allowed to create a Project with zero capability links.
- **Malformed Project frontmatter** (hand-edited in Obsidian): the file is reported as not-a-valid-Project and skipped on import — it never crashes the rescan or the app.
- **Milestone referenced by a Project is deleted**: deleting a Milestone must not delete the Project; the Project's link to that Milestone is dropped (the Project survives, possibly with its remaining Milestone links). If it was the Project's only Milestone, the Project is left with **zero** links — this is tolerated *post-deletion* even though creation requires ≥1, so no read/edit/display path may assume a Project always has ≥1 Milestone (the ≥1 rule is re-checked only when the learner saves an edit).
- **Project file deleted in Obsidian** while still tracked: surfaced as missing on rescan; the learner can clear the stale tracking record.
- **Resource referenced by a Project is deleted**: the Project survives; the dangling Resource reference is dropped.
- **Closing a Project that is still `open`** (never touched): allowed — the learner may close directly to `complete` or `abandoned`.
- **Switching the active vault**: Projects shown always belong to the active vault; switching vaults shows that vault's Projects (none bleed across).
- **Zero Projects on a Course**: a permanent, valid state — no empty-state error, no nudge to create one.

## Requirements *(mandatory)*

### Functional Requirements

#### Authoring & vault materialization (US1)

- **FR-001**: The system MUST let the learner create a Project from a Course, requiring a title, at least one Milestone of that Course, and a one-sentence capability statement.
- **FR-002**: The system MUST allow a Project to reference one or more Milestones (1..N), restricted to the Milestones of the Project's own Course.
- **FR-003**: The system MUST support optional Project attributes at authoring time: additional Milestones, a starting template choice, an opening problem framing, and references to Resources each with an optional locator. The opening problem framing, if provided, MUST be written **once** into the new file's `Problem` section at creation (thereafter learner-owned like the rest of the body); it MUST NOT be a collected-but-discarded input.
- **FR-004**: On save, the system MUST write the Project as a clean, human-readable Markdown file into the active vault, using the sanctioned vault-write path (atomic write, never clobbering external/unsaved edits).
- **FR-005**: Each Project file MUST carry mandatory frontmatter — at minimum its type marker, identity, course, milestone references, capability statement, status, opened date, optional closed date, and optional template — and this frontmatter MUST be validated when read; a malformed file MUST be skipped gracefully, never crash.
- **FR-006**: The system MUST confine its automatic edits to clearly delimited regions of the Project file so that learner-written freeform body content is never overwritten on a subsequent sync.
- **FR-007**: The system MUST ship exactly three starting templates (`math/proof`, `cs/implement`, `freeform`) that shape only the initial freeform body; templates MUST NOT be enforced as validators — a Project whose body diverges from any template is still valid.

#### Lifecycle, reflection & retention (US2)

- **FR-008**: The system MUST track a Project status of `open`, `in-progress`, `complete`, or `abandoned`, with transitions driven by the learner; no automated process may move a Project to `complete`.
- **FR-009**: The system MUST move a Project from `open` to `in-progress` when work first touches it (e.g. a Daily-Loop session is planned against it) or when the learner advances it manually.
- **FR-010**: The system MUST allow a planned Daily-Loop session to optionally target a Project as its work block; completing or planning such a session reflects on the Project's status per FR-009.
- **FR-011**: The system MUST let the learner close a Project as either `complete` (capability claimed) or `abandoned` (neutral, no-claim), recording a closed date and capturing a reflection.
- **FR-012**: On close, the system MUST offer to spawn spaced-repetition cards from the reflection, with the learner explicitly selecting/approving each card; the system MUST NOT create any card automatically. Spawned cards MUST be associated with the Project.
- **FR-013**: The system MUST NOT grade, score, or otherwise assess the correctness or quality of a Project's work product.

#### Round-trip, visibility & deletion (US3)

- **FR-014**: The system MUST import Project files from the vault on rescan, identifying them by their frontmatter type and reconciling them with tracked Projects by their identity (external creations and edits are honored).
- **FR-015**: The dashboard MUST surface active (`open`/`in-progress`) Projects grouped by Domain, as a read-only count/list that links to the relevant Course/Project, and MUST show nothing fabricated when there are none.
- **FR-016**: Deleting a Project MUST remove its tracking records and MUST let the learner choose the vault file's fate: **detach** (leave the file, strip the app's markers so it will not re-import) or **delete the file** (explicit, confirmed; if the file changed since the app last wrote it, warn and require a second confirmation).
- **FR-017**: All Projects MUST be scoped to the active vault, inheriting their vault transitively through their Course's Domain; switching vaults MUST NOT show another vault's Projects.

#### Cross-cutting guardrails

- **FR-018**: A Project's deletion MUST never destroy a vault file without explicit learner confirmation, and detaching MUST leave a file that does not re-import.
- **FR-019**: The feature MUST operate fully locally — no network calls, no telemetry, no analytics — and MUST contain no AI behavior in this MVP.
- **FR-020**: Deleting a Milestone or a Resource that a Project references MUST NOT delete the Project; the dangling reference MUST be dropped while the Project survives (including the zero-Milestone case per the edge case above). This survival behavior MUST be covered by an automated test.

### Key Entities *(include if feature involves data)*

- **Project**: An applied-practice artifact belonging to exactly one Course. Attributes: identity, title, capability statement (one sentence), status (`open`/`in-progress`/`complete`/`abandoned`), opened date, optional closed date, optional template, and a pointer to its canonical vault Markdown file. Owns a freeform, domain-shaped body the learner controls.
- **Project ↔ Milestone link**: A many-to-many association capturing the 1..N Milestones a Project exercises. Restricted to Milestones of the Project's Course. Removing a Milestone removes only the link.
- **Project ↔ Resource reference**: An optional many-to-many association, each with a free-form locator, capturing specific reference material a Project targets (e.g. a chapter of a textbook).
- **Session ↔ Project link**: An optional association marking a Daily-Loop session as a work block for a Project. Most sessions have no Project.
- **Card ↔ Project link**: An optional association marking a spaced-repetition card as having been spawned from a Project's close-reflection. Most cards have no Project.
- **Project template**: One of three shipped starting body shapes (`math/proof`, `cs/implement`, `freeform`); a suggestion for the initial file body, never a validation rule.
- **Project Markdown file**: The canonical representation in the vault — mandatory frontmatter (integration layer) plus a freeform body (domain-shaped, learner-owned).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner can create a Project tied to at least one Milestone in under 2 minutes, and within that flow it appears both in-app (under the Course) and as a readable Markdown file in the vault.
- **SC-002**: 100% of Projects created in-app produce a vault file a person would be comfortable seeing in their own notes — clean Markdown, no app-internal clutter in the freeform body.
- **SC-003**: Editing a Project's freeform body in Obsidian and re-syncing preserves the learner's edits in every case (zero clobbered bodies).
- **SC-004**: A learner can carry a Project from creation → in-progress → close-with-reflection and spawn at least one card from the reflection, with no step in the flow auto-marking mastery or grading the work.
- **SC-005**: A Project file authored entirely outside the app (in Obsidian) is imported on rescan with its milestone references, capability statement, and status intact.
- **SC-006**: Deleting a Project never removes a vault file without an explicit confirmation, and a "detached" file is never re-imported on a later rescan.
- **SC-007**: Zero Projects is a valid, friction-free state for any Course — no forced creation and no empty-state error.
- **SC-008**: A learner with no active Projects sees no fabricated or placeholder Project data anywhere in the app.

## Assumptions

- **Builds on existing capabilities**: the canonical vault read/write spine with atomic, never-clobber writes, drift detection, and a sanctioned delete (Features 005/007); the Course↔MOC authoring with rescan round-trip and the marker-delimited document approach (Feature 007); Course Milestones (007); the two-phase Daily-Loop session model (Features 012/013); the spaced-repetition card model and the existing session card-draft → card materialization path (Features 010/012); the Resource registry with locators (Features 010/011); the active-vault data boundary (Feature 009); and the real-data dashboard (Feature 008). These are reused, not rebuilt.
- **File placement**: Project files live in the vault near the learner's other course material; the exact subfolder/naming convention (mirroring how Course MOCs are placed) is an implementation decision for planning.
- **Templates are plain Markdown**: only the three seed templates ship in V1; the design does not preclude a learner adding their own outside the app, but in-app template management is not in scope.
- **Capability statement is freeform prose** (one sentence), not a structured/validated field beyond being required and non-empty.
- **"Touched by a session"** means a Daily-Loop session has been planned against the Project (the link established at session-plan time); manual status advancement is also available.
- **Single active vault** at a time; Projects belong to whichever vault is active.
- **No schema/migration commitments** are made here; the PRD reserves the data shape, but the concrete storage/migration design is a planning decision.

## Out of Scope (deferred)

- **AI Project suggestion** / Course-Blueprint `projectSeeds[]` (PRD F11.4) — a later AI-phase feature; this MVP is manual-only.
- **Auto-grading / correctness assessment** of Project work — a locked non-goal; the platform never adjudicates a proof, computation, or piece of code.
- **Mandatory Projects per Course** — Courses may have zero Projects permanently.
- **Cross-Course Projects** — a Project belongs to exactly one Course; cross-Course application is what Bridge notes are for.
- **Feynman targeting** of complete Projects (PRD F4) and the scheduler "cold open Project" surfacing beyond the simple dashboard listing (PRD F6).
- **Daily-Loop reflection-seeding** ("retrieval-before-reveal pulls from prior Project reflections") — a later loop enhancement.
