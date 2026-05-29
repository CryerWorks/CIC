# Implementation Plan: Course Session Planner

**Branch**: `013-course-session-planner` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-course-session-planner/spec.md`

## Summary

Add the **course-level curriculum layer** on top of Feature 012: give each Course's sessions an explicit **order** and an optional **Milestone** association, and turn the Course-detail "Sessions" section into an ordered, milestone-aware curriculum view with **coverage** (which Milestones have sessions) and **progress** (done / total). **No AI, no vault writes** — purely SQLite ordering + mapping + derived read-models. Doing a session and the per-session planner (012) are reused unchanged.

**Technical shape:** one additive migration (`m0007`: `sessions.milestone_id` nullable FK `ON DELETE SET NULL`, and a course-scoped `sessions.order_index`), a handful of repo functions (`listCourseSessions`, `reorderCourseSessions`, `setSessionMilestone`, plus `planSession` gains an `order_index` and an optional `milestoneId`), and an enhanced `useCoursePlans` + `CourseSessions` on the existing Course-detail screen. Coverage and progress are computed in the hook from the ordered session list + the Course's Milestones — no new tables.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19, Vite. No Rust/native code this feature.

**Primary Dependencies**: existing `src/db` spine (SqlExecutor + repos + migration runner), `src/db/repositories/{sessions,milestones,courses,resources}`, the Feature 012 `useCoursePlans`/`SessionPlanner`/`CourseDetailRoute` surfaces, React Router, zod.

**Storage**: SQLite — `sessions` gains `milestone_id` + `order_index` via `m0007` (schema 6 → 7). No vault writes in this feature (planning/sequencing is tracking-only).

**Testing**: Vitest — node-adapter repo/migration tests (ordering, reorder, milestone set/clear + `ON DELETE SET NULL`, coverage/progress aggregation, the migration version bump + partial-apply self-heal already covered); jsdom + `renderApp` component tests for the curriculum view (sequence, move up/down, milestone assign, coverage, progress) on the Course-detail screen.

**Target Platform**: Tauri desktop (Windows/macOS/Linux), fully offline.

**Project Type**: Desktop app (single-user, local-first).

**Performance Goals**: Instant reorder/assign (a reorder is a single bounded `UPDATE` batch over one Course's sessions — a handful of rows); the curriculum view renders from two small queries.

**Constraints**: Offline, no network, no AI; vault-sacred (trivially — no vault writes); preserve desirable difficulty (order is a guide not a gate; no mastery state).

**Scale/Scope**: Personal use; a Course has on the order of tens of sessions. One migration + model edit, ~4 repo functions, one hook + one screen section enhanced.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | How this feature complies |
|---|---|---|
| **I. Vault Sacred** | ✅ PASS (trivial) | This feature performs **no vault writes** — ordering and Milestone mapping are SQLite-only tracking state. The vault is touched only by *doing* a session (Feature 012), unchanged. |
| **II. AI Vendor-Agnostic** | ✅ PASS (trivial) | No AI calls, no vendor SDK imports. The AI course-generator that will later auto-produce the sequence is Phase 3 and out of scope. |
| **III. Desirable Difficulty** | ✅ PASS (central) | The sequence is a **guide, not a gate** (FR-005): it never locks or hides sessions, and the learner may do any session in any order from the Daily Loop. Planning/sequencing marks nothing "learned"; progress is a literal done/total count with **no fabricated mastery** (FR-012). |
| **IV. Interface-First Deep Modules** | ✅ PASS | New ordering/mapping logic is deep behind the `src/db` barrel; the feature imports the db **interface**, never adapters. Coverage/progress are pure derivations in the hook. No new cross-cutting interface warranted. |
| **V. Spec-Driven** | ✅ PASS | Spec written + validated (0 clarifications); this plan + full Phase-1 doc set; mandatory walkthrough at the end. Realizes the deferred §8 `sessions.milestone_id` decision (flagged in 010/012) — reconciled into the PRD. |

**No violations.** Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-course-session-planner/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── session-ordering.md   # repo contract: order_index + reorder + milestone mapping + listCourseSessions
│   └── ui-curriculum.md      # the Course-detail curriculum view contract (sequence, move, assign, coverage, progress)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── db/
│   ├── migrations/
│   │   ├── m0007_session_curriculum.ts   # NEW — sessions.milestone_id (FK SET NULL) + sessions.order_index (+index)
│   │   └── index.ts                       # MODIFIED — register m0007
│   ├── models/
│   │   └── session.ts                     # MODIFIED — add milestone_id + order_index to SessionSchema
│   ├── repositories/
│   │   └── sessions.ts                    # MODIFIED — planSession (order_index + optional milestoneId), listCourseSessions, reorderCourseSessions, setSessionMilestone
│   ├── migrate.test.ts / migrate.evolution.test.ts / migrate.lossless.test.ts  # MODIFIED — version 6→7 pins
│   └── repositories/sessions.test.ts      # MODIFIED — ordering/reorder/milestone/coverage tests
├── features/
│   └── courses/
│       ├── useCoursePlans.ts              # MODIFIED — load ALL course sessions (ordered) + derive coverage/progress; reorder + setMilestone
│       ├── SessionPlanner.tsx             # MODIFIED — optional Milestone picker at plan time (so new sessions can be tagged on creation)
│       ├── CourseDetailRoute.tsx          # MODIFIED — CourseSessions becomes the ordered curriculum view (move ↑/↓, milestone select, coverage strip, progress)
│       └── CourseDetailRoute.test.tsx     # MODIFIED — curriculum sequence/reorder/milestone/coverage/progress tests
```

**Structure Decision**: Reuse the Feature 012 surfaces (`useCoursePlans`, `SessionPlanner`, `CourseDetailRoute`) rather than introduce a new route — the curriculum is the Course's "Sessions" section grown up. Data access stays behind `src/db`; the only genuinely new logic worth isolating + testing is the **ordering/mapping repo functions** (node-adapter tested) and the **coverage/progress derivation** (pure, hook-level).

## Phase 0 — Research (decisions)

See [research.md](./research.md). Headlines:

- **R1 — One additive migration `m0007`** (schema 6 → 7): `sessions.milestone_id` (nullable FK `ON DELETE SET NULL`) + `sessions.order_index` (`INTEGER NOT NULL DEFAULT 0`). Realizes the §8 `milestone_id` deferred in 010/012, now that course-level milestone coverage genuinely needs it.
- **R2 — Ordering is a normalized 0..N-1 per Course.** `reorderCourseSessions(courseId, orderedIds)` rewrites `order_index = position` for the whole course in one transaction, so a move can never leave duplicate positions. Sort tiebreak is `(order_index, date, id)` so pre-feature rows (all `order_index=0`) and any tie still render deterministically (FR-004).
- **R3 — `milestone_id` is `ON DELETE SET NULL`** (FR-008): deleting a Milestone unmaps its sessions; it never deletes or blocks them. App-level validation limits the picker to the Course's own Milestones (FR-010); the FK only guarantees a valid milestone id.
- **R4 — Coverage & progress are derived, not stored.** Computed in `useCoursePlans` from `listCourseSessions` + `listMilestonesByCourse` (count sessions per `milestone_id`; done/total by `status`). No new tables, no denormalized counters to drift.
- **R5 — `planSession` sets `order_index` at the end + accepts an optional `milestoneId`.** New sessions append (`MAX(order_index)+1` for the Course) and may be milestone-tagged on creation; existing planning behavior (012) is otherwise unchanged.
- **R6 — Curriculum shows ALL of a Course's sessions** (planned + completed) in order; planned rows carry the move/assign/delete controls, completed rows render as done. The Daily Loop "do" surface is untouched (order is not enforced there — FR-005).

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — `m0007`, the two new `sessions` columns, the `SessionSchema` additions, the ordering invariant, and the coverage/progress derivations.
- [contracts/session-ordering.md](./contracts/session-ordering.md) — repo signatures + invariants: `planSession` (order + optional milestone), `listCourseSessions`, `reorderCourseSessions`, `setSessionMilestone`; ordering normalization; `ON DELETE SET NULL`.
- [contracts/ui-curriculum.md](./contracts/ui-curriculum.md) — the Course-detail curriculum view: ordered sequence, move ↑/↓, Milestone assign/clear, coverage strip, progress, the guide-not-gate guarantee, accessibility.
- [quickstart.md](./quickstart.md) — the live `tauri dev` walkthrough: plan several sessions, sequence them, map to milestones, see coverage + progress, then do them from the Daily Loop in any order.

**Agent context update:** the `<!-- SPECKIT … -->` plan reference in `CLAUDE.md` is pointed at this plan.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
