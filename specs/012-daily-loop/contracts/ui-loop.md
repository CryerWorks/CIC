# Contract — Daily Loop UI (planning + doing)

Two surfaces (R9): **planning** on the Course-detail route, **doing** on the Daily Loop route. Both mirror the vault-gating of `ResourcesRoute`/`CourseDetailRoute` and the hook-owns-state pattern of `useResources`/`useCourseCards`.

## Planning surface — Course detail (`/courses/:courseId`)

A new **"Sessions"** section under the existing Cards section (state in `useCoursePlans(courseId)`):

- Lists the Course's **planned** sessions (`listPlannedSessionsByCourse`) — objective + planned date — each with **Delete** (`deletePlannedSession`) and a hint that it's done from the Daily Loop.
- A **"Plan a session"** action opens `SessionPlanner`, a sectioned form:
  | Section | Required? | Behavior |
  |---|---|---|
  | **Objective** | required | Pick an optional Milestone → seeds the editable objective text. Save is blocked while empty (FR-002). |
  | **Assignments** | optional | Add rows: Resource picker (scoped to the active vault via `listResources`), `assignment_kind`, free-form locator. |
  | **Pretest questions** | optional | Add 0..N question strings (no answers here). |
  | **Card prompts** | optional | Add 0..N `{front, back?}` — back optional, completed while doing. |
- **Save** → `planSession(...)` → the new planned session appears in the list. **Cancel** persists nothing (FR-030).
- With no registered Resources, the Assignments section shows guidance linking to `/resources`.

## Doing surface — Daily Loop (`/loop`)

- **Vault gate**: `checking` → "Loading…"; not `ready` → a Callout linking to `/vault`.
- **Landing (`LoopRoute`)**: a **Planned sessions** list (`listPlannedSessions`, active vault) — each with **Start** — plus a short **recent-completed** list (objective + date, linking to its writeup, best-effort open). With none planned, guidance links to `/courses` ("plan a session in a Course first").
- **Start** loads the planned session (`getSession` + `listSessionAssignments` + `listPretestResponses` + `listSessionCardDrafts`) into `useDailyLoop` and launches the stepper.

### The doing stepper (`useDailyLoop` owns all doing state)

Objective is shown read-only (established at plan time). Ordered steps; **Next**/**Back**; steps with no planned content are pass-through.

| # | Step | Behavior |
|---|---|---|
| 1 | **Pretest** | Shows the planned questions; the learner attempts each (fills an answer). Framed "attempt from memory — wrong is expected." No correct/incorrect UI, no score (FR-023, Constitution III). Empty when none planned. |
| 2 | **Active study** | Lists the **pre-assigned** resources (read-only) and **Open**s each at its locator via `openCitation(resourceTarget(resource, locator))`. Non-openable kinds show the locator as text (FR-014). No authoring here. |
| 3 | **Retrieve from memory** | A scratchpad that **starts empty**, before re-opening sources (retrieval-before-reveal). Non-empty → `did_retrieval = true`. |
| 4 | **Atomic note** | Title + Markdown body → written to the vault via `VaultWriter` on finish (held as a draft until then). Supports `[[wikilinks]]`. |
| 5 | **Self-test** | A scratchpad for explaining/quizzing oneself (manual stand-in for the future AI Feynman panel). Never graded. |
| 6 | **Complete cards** | Shows the staged card prompts; the learner edits the front / fills the back; MAY add a card. Materialized on finish as **new** cards with inherited citations (FR-021/22). |
| 7 | **Finish** | Review summary → `finalizeSession` (session → completed + answers + cards) → write writeup. Success links to the writeup; a writeup failure shows a **retry** (session already completed — R7). |

## Gating & guardrails (Constitution III, surfaced in UI)

- The retrieval scratchpad is never pre-filled with source text or any "answer".
- The pretest UI shows no correct/incorrect indicator and no score.
- No step marks a Course/Milestone/Card/Note learned; finishing records the session + writeup; materialized cards appear **new** in `/review`.
- Abandoning the planner persists nothing; abandoning the doing flow leaves the session **planned** (FR-030).

## Accessibility

- Each control has an accessible name (`aria-label`/associated `<label>`).
- The stepper exposes the current step + progress; Next/Back/Skip are real `<button>`s; focus moves to the new step heading on transition.
- Honors the Obsidian tokens (charcoal surfaces, purple brand; **no cyan** — reserved for AI output, of which this feature has none).

## Testability

- Planning: a Course-detail component test (`renderApp`, seeded node DB) plans a session and asserts it appears in the list + persists as `planned` with children.
- Doing: `renderApp({ initialEntries: ["/loop"], initialize, connect })` with a seeded planned session; the opener is injected (as in `openTarget` tests) so "Open" is assertable without Tauri; the writeup builder is unit-tested separately (pure); the plan/finalize paths are node-adapter tested.
