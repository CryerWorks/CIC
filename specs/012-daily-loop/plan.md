# Implementation Plan: The Daily Loop (plan a session, then do it)

**Branch**: `012-daily-loop` | **Date**: 2026-05-29 (rev. two-phase) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-daily-loop/spec.md`

## Summary

Build the Daily Loop (PRD F2) as **two phases**: (1) **plan a session** inside a Course — establish the objective, the resource assignments, the pretest questions, and the intended card prompts, saved as a **planned** session; (2) **do the session** from the Daily Loop — a guided flow (`pretest → active study → retrieve → atomic note → self-test → complete cards → finish`) that executes the plan, marks the session **completed**, materializes its cards, and writes a human-readable writeup note into the vault. **No AI** — the AI-slated steps (pretest generation, Feynman, drafted cards) are manual: authored at plan time, engaged at do time.

**Key change from the first cut:** the original built a single-sitting flow that made the learner *author* the whole session inline and "finish" immediately — conflating the syllabus role with the student role. This revision separates **establishing** a session from **doing** it (like a real course). That requires a session **lifecycle** (`planned → completed`), so this version **adds one additive migration** (`m0006_session_lifecycle`: `sessions.status` + `sessions.completed_at` + a `session_card_drafts` table), reversing the first cut's "no migration / a row means a completed session." `session_assignments` and `pretest_responses` are reused (written at plan time; pretest answers updated at finish).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19, Vite. No Rust/native code this feature.

**Primary Dependencies**: existing `src/db` spine (SqlExecutor + repos + migration runner), `src/vault` spine (`VaultWriter`/`VaultReader` via `useVault()`), `src/features/srs/citations/openTarget` (`resourceTarget`/`openCitation`), `src/db/repositories/{cards,cardResources,resources,courses,milestones}`, React Router, zod.

**Storage**: SQLite (`sessions` + `session_assignments` + `pretest_responses` from `m0001`; **+ `m0006`** adds `sessions.status`/`completed_at` and `session_card_drafts`) + Obsidian vault (the writeup + any atomic notes, written only via `VaultWriter`).

**Testing**: Vitest — node-adapter repo/integration tests for plan/finalize/listing + vault-scoping + the migration; pure unit tests for the writeup builder; jsdom + `renderApp` component tests for the planning form (Course detail) and the doing stepper (with injected fakes for the opener and vault).

**Target Platform**: Tauri desktop (Windows/macOS/Linux), fully offline.

**Project Type**: Desktop app (single-user, local-first).

**Performance Goals**: Instant step transitions; a finish (DB update + card inserts + one vault write) completes well under ~200 ms.

**Constraints**: Offline, no network, **no AI provider configured**; vault-sacred (Constitution I); preserve desirable difficulty (Constitution III); vendor-agnostic (Constitution II — trivially satisfied, no AI here).

**Scale/Scope**: Personal use; a handful of sessions per day. One new feature folder (`features/loop/`), additions to `features/courses/` (the planning surface), one repo file, one migration + model, one pure module, one route + nav entry.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | How this feature complies |
|---|---|---|
| **I. Vault Sacred** | ✅ PASS | The atomic note **and** the writeup are written **only** through `VaultWriter.writeNote` (atomic temp→rename, never-clobber). Planning writes **nothing** to the vault. The writeup body is built by a pure module emitting clean, human-readable Markdown (`type: log`). A drift/unmanaged conflict refuses the write and surfaces "write anyway". No binaries; no ad-hoc `fs` on vault paths. The new SQLite table holds card *prompts* (tracking), not vault content. |
| **II. AI Vendor-Agnostic** | ✅ PASS (trivial) | No AI calls and no vendor SDK imports anywhere in this feature. |
| **III. Desirable Difficulty** | ✅ PASS (central) | Retrieval scratchpad starts empty and precedes re-opening sources; pretest is never graded/scored; staged card prompts are **not** cards until the learner completes them on finish, when they enter the queue as **new** (never pre-reviewed); nothing is auto-marked "learned" — `minutes`/`did_retrieval` are tracking, not mastery flags; planning a session marks nothing learned. |
| **IV. Interface-First Deep Modules** | ✅ PASS | New repo functions are deep implementations behind the `src/db` barrel; the feature imports the db/vault **interfaces**, never adapters. Resource opening goes through the existing injectable `openCitation` seam. The writeup builder is a pure function (no I/O), unit-testable in isolation. |
| **V. Spec-Driven** | ✅ PASS | Spec rewritten + this plan + full Phase-1 doc set re-revised; the migration + lifecycle reversal of R1/R2 are recorded in research. Mandatory walkthrough at the end. |

**No violations.** Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/012-daily-loop/
├── plan.md              # This file
├── research.md          # Phase 0 (R1/R2/R5 rewritten for two-phase; R10–R12 new)
├── data-model.md        # Phase 1 (m0006 migration; session_card_drafts; plan + finalize shapes)
├── quickstart.md        # Phase 1 (live tauri dev walkthrough — plan then do)
├── contracts/
│   ├── session-data.md      # planSession / finalizeSession / listing contracts + invariants
│   ├── vault-writeup.md      # the writeup note contract (unchanged shape)
│   └── ui-loop.md            # planning surface (Course detail) + doing stepper (Daily Loop)
└── tasks.md             # Phase 2
```

### Source Code (repository root)

```text
src/
├── db/
│   ├── migrations/
│   │   ├── m0006_session_lifecycle.ts   # NEW — sessions.status + completed_at + session_card_drafts
│   │   └── index.ts                      # MODIFIED — register m0006
│   ├── models/
│   │   ├── session.ts                    # MODIFIED — add status + completed_at
│   │   └── sessionCardDraft.ts           # NEW — SessionCardDraft zod model
│   ├── repositories/
│   │   └── sessions.ts                   # MODIFIED — planSession, finalizeSession (update), listPlanned*, listSessionCardDrafts, deletePlannedSession
│   └── index.ts                          # MODIFIED — re-export the new model + fns (additive)
├── features/
│   ├── courses/                          # the PLANNING surface
│   │   ├── CourseDetailRoute.tsx          # MODIFIED — add a "Sessions" section (planned list + Plan a session)
│   │   ├── useCoursePlans.ts              # NEW — list/plan/delete planned sessions for a course
│   │   ├── SessionPlanner.tsx             # NEW — sectioned plan form (objective, assignments, pretest Qs, card prompts)
│   │   └── *.test.tsx
│   └── loop/                             # the DOING surface
│       ├── LoopRoute.tsx                 # planned-sessions list + recent-completed; launches the doing flow
│       ├── useDailyLoop.ts               # loads a planned session; doing state; finalize/persist + writeup
│       ├── writeup.ts                    # PURE: build the writeup NoteInput
│       ├── writeup.test.ts
│       ├── Stepper.tsx                   # step chrome / next-back / skip
│       └── steps/                        # doing steps (presentational; state lifted to the hook)
│           ├── PretestStep.tsx           # attempt the planned questions (ungraded)
│           ├── ActiveStudyStep.tsx       # open the pre-assigned resources at their locators
│           ├── RetrievalStep.tsx
│           ├── NoteStep.tsx
│           ├── SelfTestStep.tsx
│           ├── MakeCardsStep.tsx         # complete the staged card prompts
│           └── FinishStep.tsx
├── app/
│   ├── router.tsx                        # MODIFIED — <Route path="loop" .../> (already added)
│   └── navigation.ts                     # MODIFIED — { path: "/loop", label: "Daily Loop" } (already added)
```

**Structure Decision**: Planning lives in `features/courses/` (the Course is where sessions are established — R9), doing lives in `features/loop/`. Data access stays behind `src/db`; vault writes behind `src/vault`. The genuinely new logic worth isolating + testing: the **migration** (version-pinned), the **plan/finalize** repo paths (node-adapter tested), and the **writeup builder** (pure).

## Phase 0 — Research (decisions)

See [research.md](./research.md). Headlines:

- **R1 — One additive migration** (`m0006`): `sessions.status` + `completed_at` + `session_card_drafts`; schema 5 → 6 (reverses the first cut's "no migration").
- **R2 — Lifecycle**: `planSession` inserts `planned`; `finalizeSession` updates to `completed`. Abandoning doing leaves the row `planned`.
- **R3 — Vault scoping transitive** via `course → domain.vault_id` (no `sessions.vault_id`).
- **R4 — Milestone seed-only** (no `sessions.milestone_id`).
- **R5 — Card drafts staged at plan, materialized (cited, deduped) at finish**, then deleted; cards enter the queue **new**.
- **R6 — Writeup `Sessions/<date> <slug> (<short-id>).md`**, never-clobber, `type: log`.
- **R7 — Finish: DB-first then vault**; a vault failure leaves the session completed + offers retry.
- **R8 — Reuse the opener seam**; fix the `mm:ss-mm:ss` range → start-of-range.
- **R9 — Two surfaces**: plan on Course detail, do on the Daily Loop.
- **R10–R12** — `session_card_drafts` shape; phase-specific abandon semantics; `finalizeSession` updates (not inserts).

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — `m0006`, the new columns/table/model, validation, the plan + finalize shapes.
- [contracts/session-data.md](./contracts/session-data.md) — `planSession`, `finalizeSession` (update), `listPlannedSessions`/`listPlannedSessionsByCourse`/`listSessionsByVault`, `listSessionCardDrafts`, `deletePlannedSession`; invariants (citation inheritance + dedupe, vault scoping, never-grade).
- [contracts/vault-writeup.md](./contracts/vault-writeup.md) — the writeup `NoteInput` contract (frontmatter, body sections, never-clobber) — shape unchanged.
- [contracts/ui-loop.md](./contracts/ui-loop.md) — the planning form (Course detail) + the doing stepper (Daily Loop): step order, skip rules, retrieval-before-reveal, open-at-locator, accessibility.
- [quickstart.md](./quickstart.md) — the live `tauri dev` end-to-end: plan a session in a Course, then do it from the Daily Loop.

**Agent context update:** the `<!-- SPECKIT … -->` plan reference in `CLAUDE.md` points at this plan.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
