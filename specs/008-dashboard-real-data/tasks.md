---
description: "Task list for Feature 008 — Command Center Dashboard (real data)"
---

# Tasks: Command Center Dashboard (real data)

**Input**: Design documents from `specs/008-dashboard-real-data/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution §V + CLAUDE.md require unit tests for data-integrity surfaces (the aggregate read-model), and the contracts list explicit test obligations. UI gets component tests.

**Organization**: By user story (US1 P1 → US2 P2 → US3 P3), after a shared Setup + Foundational (read-model + hook + screen scaffold) phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task → parallelizable
- File paths are exact and relative to the repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the feature's home; confirm no new tooling needed.

- [X] T001 Create `src/features/dashboard/` (the F8 feature home, mirroring `src/features/courses/`); confirm no new runtime dependencies are needed and that `tsconfig`/`eslint` already cover `src/**`.

---

## Phase 2: Foundational (Blocking Prerequisites) — read-model + hook + screen scaffold

**Purpose**: The shared data layer + screen shell all stories render from (Constitution IV — read through the repository layer over `SqlExecutor`, never the plugin). The retention tiles stay honest from the start.

**⚠️ CRITICAL**: No user story tile work can begin until this phase is complete.

- [X] T002 [P] Unit tests for `getDashboardSummary` — totals; milestone status breakdown + `percentDone`; empty DB (zeros, no `NaN`, empty allocation); Course with no Milestones; Domain with no Courses (still in allocation); allocation correctness + sums + ordering; a status outside the enum throws — in `src/db/repositories/dashboard.test.ts` (`// @vitest-environment node`, `node:sqlite`).
- [X] T003 Implement `getDashboardSummary(db)` + result types (`DashboardSummary`, `DashboardTotals`, `MilestoneProgress`, `DomainAllocation`) via ~3–4 `GROUP BY` queries parsed with ad-hoc zod schemas in `src/db/repositories/dashboard.ts`; export from `src/db/index.ts` (depends T001; satisfies T002).
- [X] T004 Implement the `useDashboard()` hook — `Promise.all([getDashboardSummary, listCourses])`, bucket courses into `summary.allocation` by `domain_id` → `courseGroups`, re-read on mount, read-only — in `src/features/dashboard/useDashboard.ts` (depends T003).
- [X] T005 Create `src/features/dashboard/DashboardRoute.tsx` scaffold: read `useDashboard()` + `useVaultState()`; render the vault banner (unset → existing "No vault connected" Callout to `/vault`; ready → a subtle "vault connected" indicator) and a loading state; wire `src/app/router.tsx` to import `DashboardRoute` from `features/dashboard`; delete the placeholder `src/app/routes/DashboardRoute.tsx` (depends T004).
- [X] T006 Move + rewrite the vault-banner component tests (banner shows when unset; hidden when ready) to `src/features/dashboard/DashboardRoute.test.tsx`; delete `src/app/routes/DashboardRoute.test.tsx` (depends T005).

**Checkpoint**: the Dashboard renders from real data sources (no placeholder), the vault banner behaves, and the read-model is green — ready for tiles.

---

## Phase 3: User Story 1 - See my real learning state at a glance (Priority: P1) 🎯 MVP

**Goal**: Real totals (Domains/Courses/Milestones) + overall milestone progress replace the placeholder.

**Independent Test**: Seed domains/courses/milestones → the totals and "X/Y done (Z%)" match; a Course with no Milestones renders without `NaN%`.

- [X] T007 [P] [US1] Implement `MilestoneProgress` — a done/in-progress/todo segmented bar + "X/Y done (Z%)" label, with `total === 0` → "no milestones yet" (no `NaN%`); theme tokens (success/brand/muted) — in `src/features/dashboard/MilestoneProgress.tsx`.
- [X] T008 [US1] Add the totals `StatCell`s (Domains, Courses, Milestones) and `<MilestoneProgress>` (fed from `summary.milestoneProgress`) to `src/features/dashboard/DashboardRoute.tsx` (depends T005/T007).
- [X] T009 [US1] Component tests for real totals + progress (e.g. 12/30 done → "40%") and the zero-milestone edge (no `NaN`) in `src/features/dashboard/DashboardRoute.test.tsx` (extend) (depends T008).

**Checkpoint**: opening the app shows a true summary — demoable; closes the Phase 1 milestone for the dashboard.

---

## Phase 4: User Story 2 - Allocation + jump to a Course (Priority: P2)

**Goal**: Per-Domain allocation (counts in each Domain's color) + a Domain-grouped Course list linking to `/courses`, with a MOC indicator.

**Independent Test**: Courses across ≥2 Domains → each Domain's counts/color correct; a zero-course Domain still appears; clicking a Course goes to `/courses`; a Course with `moc_path` shows the MOC tag.

- [X] T010 [P] [US2] Implement `DomainAllocation` — per-Domain color dot + course/milestone counts, ordered by name, zero-course Domains still shown — in `src/features/dashboard/DomainAllocation.tsx`.
- [X] T011 [US2] Add `<DomainAllocation>` (from `summary.allocation`) and the Domain-grouped at-a-glance Course list (from `courseGroups`; each Course links to `/courses`; `Tag` when `moc_path` set) to `src/features/dashboard/DashboardRoute.tsx` (depends T010/T004).
- [X] T012 [US2] Component tests: allocation counts incl. a zero-course Domain; a Course links to `/courses`; the MOC tag shows for a Course with `moc_path` — in `src/features/dashboard/DashboardRoute.test.tsx` (extend) (depends T011).

**Checkpoint**: the dashboard is a launchpad — orientation + navigation on top of US1.

---

## Phase 5: User Story 3 - Honest onboarding & "coming later" tiles (Priority: P3)

**Goal**: A new user sees onboarding (not a zero grid); the retention tiles are labeled "arrives in Phase 2" with no fabricated numbers (Constitution III).

**Independent Test**: Empty DB → onboarding linking to `/domains`; the streak/heatmap/sessions/due-cards tiles are labeled "Phase 2" and show no real-looking number; nothing reads "learned".

- [X] T013 [P] [US3] Implement `DeferredTiles` — streak / today's protocol / activity heatmap / recent sessions / due-cards as muted shells, each with a "Phase 2" `Tag` and an em-dash where a value will go; **no populated heatmap, no zeros-as-real, nothing marked "learned"** — in `src/features/dashboard/DeferredTiles.tsx`.
- [X] T014 [US3] Add the onboarding empty-state (`summary.totals.domains === 0` → Callout/Panel linking to `/domains`, ahead of the zero grid) and render `<DeferredTiles>` in `src/features/dashboard/DashboardRoute.tsx` (depends T013/T008).
- [X] T015 [US3] Component tests: empty DB → onboarding (not a zero headline); deferred tiles present + labeled "Phase 2" with no fabricated number; assert no "learned" text — in `src/features/dashboard/DashboardRoute.test.tsx` (extend) (depends T014).

**Checkpoint**: all three stories functional; the screen is welcoming and intellectually honest.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T016 [P] Run the full gate — `npm run test` (Vitest), `tsc --noEmit` (strict), `npm run lint` — and fix any regressions (especially fallout from removing the placeholder `DashboardRoute` + its `Placeholder` import).
- [ ] T017 Run the [quickstart.md](./quickstart.md) scenarios A–F in `npm run tauri dev` (manual runtime check — the user's surface).
- [ ] T018 [P] After implementation: update the CLAUDE.md SPECKIT block to "implemented" and deliver the mandatory end-of-feature walkthrough (Constitution V).

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup. **Blocks all stories** (read-model + hook + screen scaffold).
- **US1 (P3)** → after Foundational. The MVP (totals + progress tiles).
- **US2 (P4)** → after Foundational; adds allocation + course list to the same screen (independent of US1's tiles, but both edit `DashboardRoute.tsx` so sequence the screen edits).
- **US3 (P5)** → after Foundational; adds onboarding + deferred tiles (independent of US1/US2 data; shares the screen file).
- **Polish (P6)** → after the desired stories.

### Within a story
- Tests precede the implementation they cover (write failing test → implement → green).
- Read-model → hook → screen. New presentational components ([P]) are built before they are wired into `DashboardRoute.tsx`.

### Parallel opportunities
- Foundational: T002 (tests) is [P] alongside scaffolding thought, but T003 implements against it.
- The three presentational components are [P] across files: **T007** (`MilestoneProgress`), **T010** (`DomainAllocation`), **T013** (`DeferredTiles`) can be built in parallel; their wiring tasks (T008/T011/T014) all edit `DashboardRoute.tsx` and must serialize.

---

## Parallel Example: presentational components

```bash
Task: "Implement MilestoneProgress in src/features/dashboard/MilestoneProgress.tsx"   # T007
Task: "Implement DomainAllocation in src/features/dashboard/DomainAllocation.tsx"      # T010
Task: "Implement DeferredTiles in src/features/dashboard/DeferredTiles.tsx"            # T013
```

(Then wire them into `DashboardRoute.tsx` one at a time: T008 → T011 → T014.)

---

## Implementation Strategy

### MVP first (US1 only)
1. Setup → 2. Foundational (read-model green, screen scaffold, vault banner) → 3. US1 → **STOP & validate**: opening the app shows real totals + progress instead of the placeholder (quickstart Scenarios A/B). Demoable; closes the Phase 1 dashboard milestone.

### Incremental delivery
- + US2 → allocation + navigable course list (Scenario C).
- + US3 → onboarding + honest deferred tiles (Scenarios D, E). Scenario F (vault-not-gated) holds throughout.
- Each story adds value without breaking the previous.

---

## Notes
- [P] = different file, no incomplete-task dependency.
- **Read-only feature**: no `.md` writes, no vault file reads (MOC presence comes from `moc_path`), no mutations. No new SQLite schema.
- **Honesty gate (Constitution III)**: `DeferredTiles` must never render a fabricated/zeroed-as-real number or a populated heatmap, and nothing on the screen marks anything "learned".
- The read-model is the only place new SQL lives; the feature depends on the typed `getDashboardSummary`, not on the executor/plugin (Constitution IV).
- Commit after each story/logical group; keep the tree green (lint + tests).
