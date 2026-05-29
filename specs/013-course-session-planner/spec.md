# Feature Specification: Course Session Planner

**Feature Branch**: `013-course-session-planner`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Course Session Planner (Phase 2, manual, no AI) — the course-level curriculum layer on top of Feature 012: lay out a Course's whole sequence of sessions start-to-finish, ordered, and mapped to the Milestones they advance, so the user builds a coherent course from gathered Resources and then churns through it via the existing Daily Loop."

## Overview

Feature 012 lets a learner plan individual study **Sessions** on a Course and **do** them from the Daily Loop. But sessions are planned one at a time, with no ordering and no link to the Course's **Milestones** — so a Course is a loose bag of sessions, not a curriculum. This feature adds the **course-level planning layer**: arrange a Course's sessions into an explicit **start-to-finish sequence**, and tag each with the **Milestone** it advances, so the learner can see (and build toward) a coherent path that supplies the know-how to clear every Milestone — then churn through it session by session using the existing Daily Loop.

This is **manual and AI-free**. It is the surface the Phase-3 AI course-generator will later populate automatically (it will produce the same ordered, milestone-mapped sequence from the Course's resources and goals). Doing a session is unchanged from Feature 012.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sequence a Course's sessions start-to-finish (Priority: P1)

A learner who has planned several sessions on a Course arranges them into an explicit order — the order they intend to study them — and can re-order them as the plan evolves. The Course now reads as a curriculum from first session to last, and that order is reflected wherever the Course's sessions are shown.

**Why this priority**: Sequencing is the headline of this feature and the smallest thing that turns a bag of sessions into a course. It delivers value on its own, independent of milestone mapping.

**Independent Test**: On a Course with three planned sessions, set/observe their order, move one earlier and one later, and confirm the curriculum list shows them in the chosen order and the order persists across reloads.

**Acceptance Scenarios**:

1. **Given** a Course with multiple planned sessions, **When** the learner views the Course, **Then** the sessions are shown as an explicitly ordered sequence (1..N).
2. **Given** the ordered sequence, **When** the learner moves a session earlier or later, **Then** the sequence updates and the new order persists.
3. **Given** a newly planned session, **When** it is created, **Then** it is appended to the end of the Course's sequence (and can then be moved).
4. **Given** a session is deleted or completed, **When** the sequence is shown, **Then** the remaining sessions keep a stable order (no duplicate positions, no crash).

---

### User Story 2 - Map sessions to Milestones and see coverage (Priority: P2)

A learner associates each planned session with the Course Milestone it advances, and sees at a glance which Milestones have sessions planned toward them and which are still uncovered — so the plan visibly works toward completing every Milestone.

**Why this priority**: Milestone mapping realizes the "supplies the know-how to complete the Milestones" intent and surfaces gaps in the plan. It builds on US1 but is independently valuable and testable.

**Independent Test**: On a Course with two Milestones and three planned sessions, tag two sessions to Milestone A and none to Milestone B; confirm the coverage view shows A as covered (2 sessions) and B as uncovered.

**Acceptance Scenarios**:

1. **Given** a planned session on a Course, **When** the learner assigns it a Milestone of that Course, **Then** the association is saved and shown on the session.
2. **Given** sessions mapped to some Milestones, **When** the learner views coverage, **Then** each Milestone shows how many sessions target it, and Milestones with zero sessions are flagged as uncovered.
3. **Given** a session mapped to a Milestone, **When** that Milestone is deleted, **Then** the session is **unmapped** (not deleted) and simply shows no Milestone.
4. **Given** a session, **When** the learner leaves its Milestone unset, **Then** the session is still valid and counts as "unassigned" in the coverage view.

---

### User Story 3 - Track progress through the curriculum (Priority: P3)

As the learner churns through the course, the curriculum view shows how far they are — which sessions in the sequence are done and which remain — so the Course reads as a path being worked through, not a flat list.

**Why this priority**: Progress visibility is motivating and closes the loop with the "do" side, but the curriculum is usable without it. It layers on US1/US2.

**Independent Test**: On a Course with four ordered sessions, complete two via the Daily Loop, return to the Course, and confirm the curriculum shows two done and two remaining, in order, with an overall progress indication.

**Acceptance Scenarios**:

1. **Given** an ordered curriculum where some sessions are completed, **When** the learner views the Course, **Then** completed and remaining sessions are distinguishable and shown in sequence.
2. **Given** a curriculum, **When** the learner views it, **Then** an overall progress indication (e.g., done / total) is shown without fabricating any "mastery" claim.

---

### Edge Cases

- **No sessions planned yet**: the curriculum view shows an empty/onboarding state guiding the learner to plan a session (Feature 012), not an error.
- **A session with no Milestone**: allowed; appears as "unassigned" in coverage and still holds its place in the sequence.
- **Deleting a Milestone that sessions point to**: those sessions are unmapped (kept), never deleted.
- **Completed sessions in the sequence**: keep their order position and are shown as done; reordering primarily concerns not-yet-done sessions but must not corrupt positions of completed ones.
- **Reordering with only one session**: a no-op; move controls are disabled/absent at the ends.
- **Two sessions momentarily sharing a position**: the view must still render deterministically (a stable tiebreak), never crash.
- **Switching the active vault**: only the current vault's Courses and their sessions are shown (unchanged from existing scoping).

## Requirements *(mandatory)*

### Functional Requirements

**Sequencing (US1)**

- **FR-001**: The system MUST maintain an explicit order for the sessions belonging to a Course and display them as an ordered sequence (1..N).
- **FR-002**: Users MUST be able to reorder a Course's sessions (e.g., move a session earlier or later), and the new order MUST persist.
- **FR-003**: A newly planned session MUST be placed at the end of its Course's sequence by default.
- **FR-004**: The ordering MUST be stable and deterministic when sessions are added, deleted, or completed (no duplicate-position ambiguity that breaks the display).
- **FR-005**: The order is a **guide, not a gate** — the system MUST NOT prevent the learner from doing sessions in any order from the Daily Loop (order does not lock or hide sessions).

**Milestone mapping & coverage (US2)**

- **FR-006**: Users MUST be able to associate a planned session with one Milestone of the same Course, and to clear that association.
- **FR-007**: A session's Milestone association MUST be optional (a session may be unassigned).
- **FR-008**: When a Milestone is deleted, sessions mapped to it MUST be unmapped (retained), never deleted.
- **FR-009**: The system MUST present a coverage view showing, per Course Milestone, how many sessions target it, and MUST flag Milestones with zero sessions as uncovered.
- **FR-010**: A session's Milestone choices MUST be limited to Milestones of that session's Course.

**Progress (US3)**

- **FR-011**: The curriculum view MUST distinguish completed sessions from not-yet-done ones and show them in sequence.
- **FR-012**: The system MUST show an overall progress indication for the Course (e.g., completed vs total sessions) without marking anything as "learned" or "mastered."

**Scope & guardrails**

- **FR-013**: Planning and re-sequencing MUST write nothing to the vault and MUST create no review cards — only *doing* a session (Feature 012) writes the writeup and materializes cards.
- **FR-014**: The feature MUST function fully offline with no AI provider configured; it provides only manual layout (no auto-generated or auto-interleaved sequence).
- **FR-015**: Sessions and their ordering/mapping MUST remain scoped to the active vault (unchanged from existing scoping).
- **FR-016**: Editing the *contents* of a session (objective, assignments, pretest, card prompts) MUST continue to use the existing per-session planner (Feature 012), reused as-is — this feature governs order and milestone mapping only.

### Key Entities *(include if feature involves data)*

- **Course** (existing): owns an ordered sequence of Sessions and a set of Milestones.
- **Milestone** (existing): a capability gate within a Course; a Session may target one Milestone.
- **Session** (existing, extended): gains a **position within its Course's sequence** and an **optional association to a Milestone of that Course**. Retains its planned/completed lifecycle and transitive vault scoping from Feature 012.
- **Curriculum** (derived, not stored): the ordered, milestone-mapped view of a Course's sessions, plus coverage and progress — computed from the above.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner can arrange a Course's sessions into a chosen start-to-finish order and the order is preserved across app restarts.
- **SC-002**: A learner can reorder a session and see the sequence update immediately (within a single interaction, no reload).
- **SC-003**: For any Course, the learner can tell at a glance which Milestones have planned sessions and which have none.
- **SC-004**: Every planned session can be done from the Daily Loop regardless of its position — ordering never blocks doing a session.
- **SC-005**: Planning or re-sequencing produces zero vault writes and zero new review cards.
- **SC-006**: After completing sessions, the Course view shows accurate done/total progress with no fabricated mastery state.
- **SC-007**: Deleting a Milestone leaves all its sessions intact (unmapped), with no data loss.
- **SC-008**: The curriculum view is isolated per vault — switching vaults shows only that vault's Courses and sessions.

## Assumptions

- **Builds on Feature 012**: the planned/completed Session lifecycle, the per-session planner, and the Daily Loop "do" flow are reused unchanged; this feature only adds course-level ordering, milestone mapping, and the curriculum/coverage view.
- **One Milestone per session (v1)**: a session targets at most one Milestone (the primary capability it advances); multi-milestone sessions are not needed for v1.
- **Reorder via move controls**: reordering uses simple move-earlier/move-later controls (accessible, testable); drag-and-drop is a later polish, not required for v1.
- **Curriculum lives on the Course-detail surface**: the existing Course "Sessions" section becomes the ordered, milestone-aware curriculum view, rather than introducing a separate route.
- **Order applies to all of a Course's sessions** (planned and completed), so the sequence reads coherently as the learner progresses; reordering is primarily exercised on not-yet-done sessions.
- **Manual-first**: the AI course-generator (Phase 3) will later produce this same ordered, milestone-mapped sequence automatically and plug into this surface.

## Out of Scope

- AI generation / auto-layout of a Course's sessions from its resources, goals, and capabilities (Phase 3, F10 course generation).
- The interleaving scheduler's algorithmic "what to do next / daily-mix" suggestion and any cross-session interleaving (F6) — this feature is manual layout only.
- Cross-course / Campaign-level planning and sequencing.
- Enforcing the sequence at do-time (gating, prerequisites, locking later sessions until earlier ones are done).
- Editing a session's contents (objective, assignments, pretest, card prompts) — owned by Feature 012's planner, reused as-is.
- Multi-Milestone sessions and Milestone ordering/dependencies.
