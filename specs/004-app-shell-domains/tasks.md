---
description: "Task list for Feature 004 — App Shell, Navigation & Domains Management"
---

# Tasks: App Shell, Navigation & Domains Management

**Input**: Design documents from `specs/004-app-shell-domains/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/provider-and-routing.md ✅, contracts/domains-repo.md ✅, quickstart.md ✅

**Tests**: Included and required — the spec calls them out (SC-005 + the quickstart test table): the `DbProvider` states, routing, and the Domains create/list/edit/delete flow are the surfaces to cover. UI/flow tests run in **jsdom** (the default) and wire a **real in-memory `node:sqlite` executor** into `DbProvider` (verified in research R2); repo-addition + restart-durability tests run in the node env (`// @vitest-environment node`).

**Organization**: By user story. US1 is the shell + store-health gate (MVP). US2 adds the first data-backed screen (create/list). US3/US4 grow it (edit/delete). US2–US4 depend on US1's shell, not on each other's logic.

## Format: `[ID] [P?] [Story?] Description + file path`

- **[P]**: different files, no dependency on an incomplete task → parallelizable
- File paths are repo-root-relative.

## ⚠️ Git note

The user owns all git. **No task runs git.** The optional `before_tasks`/`after_tasks` commit hooks are surfaced, never executed.

---

## Phase 1: Setup

**Purpose**: Bring routing into the project.

- [X] T001 Install `react-router-dom` (runtime `dependency`). (research R1)

**Checkpoint**: Routing library available.

---

## Phase 2: Foundational (shared spine — blocks all stories)

**Purpose**: The data-access provider every screen needs, plus the two story-agnostic pieces the shell and routes reuse.

**⚠️ CRITICAL**: No story can render or be tested until `DbProvider` exists.

- [X] T002 Implement `DbProvider` + context + `useDb()` / `useDbState()` in `src/app/providers/DbProvider.tsx`: a `DbState` union (`loading` | `error` | `ready` with the `SqlExecutor`), an injectable `initialize` prop defaulting to the 003 `initDatabase`; sets loading on mount, awaits, resolves to ready/error (errors surfaced, never swallowed). `useDb()` throws outside a ready provider. (contracts/provider-and-routing.md; research R3; FR-003)
- [X] T003 [P] Shared `Placeholder` screen ("Coming in a later feature") in `src/app/routes/Placeholder.tsx`. (FR-004)
- [X] T004 [P] Navigation destinations config (path · label · implemented flag) in `src/app/navigation.ts` — the single source for the sidebar and the route table. (data-model)

**Checkpoint**: The provider exposes store state; shared route bits exist.

---

## Phase 3: User Story 1 — A navigable window that surfaces store health (Priority: P1) 🎯 MVP

**Goal**: A persistent sidebar/topbar shell that navigates between destinations and gates on the store lifecycle (loading → ready | error), never a blank screen.

**Independent Test**: Healthy store → shell + default screen render and every nav item routes correctly. Rejecting initializer → error panel. Pending initializer → loading panel.

- [X] T005 [P] [US1] `Topbar` in `src/app/layout/Topbar.tsx`. (Obsidian theme; 002 kit)
- [X] T006 [US1] `Sidebar` (a `<nav>` landmark of `NavLink`s with `aria-current` + non-color-only active indicator) in `src/app/layout/Sidebar.tsx`, driven by `navigation.ts` (T004). (FR-001/FR-002/FR-014; research R6)
- [X] T007 [P] [US1] Placeholder route screens `DashboardRoute`, `CoursesRoute`, `ReviewRoute` (each renders `Placeholder`) in `src/app/routes/{DashboardRoute,CoursesRoute,ReviewRoute}.tsx`. (FR-004)
- [X] T008 [US1] `AppShell` in `src/app/layout/AppShell.tsx`: read `useDbState()` and render the gate — loading panel / error panel (Callout `danger` with `error.message`, no routed content) / ready (Sidebar + Topbar + `<Outlet/>`). (FR-003/SC-003; contracts)
- [X] T009 [US1] `router.tsx` (HashRouter) in `src/app/router.tsx`: an `AppShell` layout route with children `/` (Dashboard), `/courses`, `/review`, `/style` (existing `StyleGuide`), `/domains` (→ `Placeholder` for now; US2 replaces it), and `*` → redirect to `/`. (contracts; research R1)
- [X] T010 [US1] Rewire `src/main.tsx` to mount `<DbProvider><RouterProvider router={router} /></DbProvider>` and **remove** the fire-and-forget `initDatabase()` (the provider now owns that lifecycle); delete the superseded `src/App.tsx` and `src/App.test.tsx`. (FR-003; contracts)
- [X] T011 [US1] Test: `DbProvider` lifecycle — a pending initializer shows loading, a rejecting one shows error (with message), a resolving one shows ready/children — in `src/app/providers/DbProvider.test.tsx`. (FR-003/SC-003)
- [X] T012 [US1] Test: routing — under `MemoryRouter`, each path renders its screen (Dashboard/Courses/Review placeholders, `/style` the guide, unknown → `/`) and the active nav item carries `aria-current` — in `src/app/router.test.tsx`. (FR-001/FR-002/FR-004; SC-001)

**Checkpoint**: A real, navigable window that honestly reports store health — **MVP delivered**.

---

## Phase 4: User Story 2 — Create and see my Domains (Priority: P2)

**Goal**: The Domains screen lists Domains, guides with an empty state, and creates a Domain (name + palette color) optimistically and durably.

**Independent Test**: Empty store → empty state. Create valid → appears + persists. Invalid (blank/whitespace/duplicate) → rejected, nothing added. Optimistic create that fails → reconciles.

- [X] T013 [P] [US2] `DOMAIN_PALETTE` constant (the five `--color-domain-1..5` hexes + labels) in `src/app/routes/domains/palette.ts`. (research R5; FR-015)
- [X] T014 [US2] `useDomains` hook (list + create) in `src/app/routes/domains/useDomains.ts`: seed from `listDomains`, zod-validate input (name `trim().min(1).max(60)` + case-insensitive uniqueness; color ∈ palette) **before** an optimistic apply, call `createDomain`, reconcile on success / revert + surface error on failure. (research R4; FR-007/FR-008/FR-012)
- [X] T015 [US2] `DomainForm` (create mode) in `src/app/routes/domains/DomainForm.tsx`: labelled name input + palette color radiogroup (keyboard-navigable, non-color-only selection), inline `aria-describedby` errors, focus to first field on open / to error on rejected submit. (FR-007/FR-008/FR-014/FR-015; research R5/R6)
- [X] T016 [US2] `DomainsRoute` in `src/app/routes/domains/DomainsRoute.tsx`: list each Domain (name + color swatch), a guiding empty state when none, and the create entry wired to `useDomains` + `DomainForm`. (FR-005/FR-006/FR-007)
- [X] T017 [US2] Point the `/domains` route at `DomainsRoute` (replace the US1 placeholder) in `src/app/router.tsx`.
- [X] T018 [US2] Test: empty state shown with no Domains; create a valid Domain → it appears and is read back from the store; list shows name + color — render `DomainsRoute` under `DbProvider` with an injected in-memory `node:sqlite` executor, in `src/app/routes/domains/DomainsRoute.test.tsx`. (FR-005/FR-006/FR-007; SC-002/SC-006)
- [X] T019 [US2] Test: validation + reconcile — blank, whitespace-only, and duplicate names are rejected with nothing persisted; an optimistic create that fails reverts (no phantom row) — in `src/app/routes/domains/DomainsRoute.test.tsx`. (FR-008/FR-012)
- [X] T020 [US2] Test: **restart durability** — `// @vitest-environment node`; with a **file-backed** `node:sqlite` executor, `createDomain` a Domain, **close and reopen** the file, `listDomains` returns it intact — in `src/db/repositories/domains.test.ts`. Proves FR-011/SC-004 automatically (the UI-across-restart path stays the manual check, T035). (FR-011/SC-004)

**Checkpoint**: The first data-backed screen works end-to-end — create/list/persist (and survive a reopen) through the 003 layer.

---

## Phase 5: User Story 3 — Edit a Domain (Priority: P3)

**Goal**: Rename / recolor an existing Domain, shown immediately and persisted.

**Independent Test**: Change a Domain's name + color → list updates + survives reopen; a duplicate-name edit is rejected.

- [X] T021 [P] [US3] Add `updateDomain(db, id, { name, color })` to `src/db/repositories/domains.ts` and export it from `src/db/index.ts`. (contracts/domains-repo.md)
- [X] T022 [US3] Extend `DomainForm` with an edit mode and add `editDomain` to `useDomains` (optimistic + reconcile, same validation as create excluding the row being edited); wire the edit entry into `DomainsRoute`. (FR-009/FR-012; files: `src/app/routes/domains/{DomainForm,useDomains,DomainsRoute}.tsx/.ts`)
- [X] T023 [US3] Test: editing a Domain's name + color reflects immediately and reads back; a duplicate-name edit is rejected with the original unchanged; **and an optimistic edit that fails to persist reverts to the prior values** (no stale row) — in `src/app/routes/domains/DomainsRoute.test.tsx`. (FR-009/FR-012)
- [X] T024 [US3] Test: `updateDomain` round-trips (name + color change read back) and a duplicate-name update rejects — `// @vitest-environment node` — in `src/db/repositories/domains.test.ts`. (contracts/domains-repo.md)

**Checkpoint**: Domains are fully editable.

---

## Phase 6: User Story 4 — Delete a Domain, knowingly (Priority: P3)

**Goal**: Delete a Domain only after an explicit confirmation that states the cascade consequence.

**Independent Test**: Request delete → confirmation names the cascade; cancel keeps it; confirm removes it and it does not reappear.

- [X] T025 [P] [US4] Add `deleteDomain(db, id)` to `src/db/repositories/domains.ts` and export it from `src/db/index.ts`. (contracts/domains-repo.md)
- [X] T026 [P] [US4] `DeleteDomainDialog` in `src/app/routes/domains/DeleteDomainDialog.tsx`: `role="dialog"` + `aria-modal`, labelled, body states "its Campaigns and Courses will also be removed", focus-trapped, Escape cancels, focus returns to the trigger. (FR-010; research R6)
- [X] T027 [US4] Wire delete into `DomainsRoute` + add `removeDomain` to `useDomains` (optimistic remove, revert on failure) in `src/app/routes/domains/{DomainsRoute.tsx,useDomains.ts}`. (FR-010/FR-012)
- [X] T028 [US4] Test: requesting deletion shows the confirmation with the cascade text; cancel deletes nothing; confirm removes the Domain from the list and the store; **and an optimistic delete that fails reverts (the row reappears)** — in `src/app/routes/domains/DomainsRoute.test.tsx`. (FR-010/FR-012)
- [X] T029 [US4] Test: `deleteDomain` removes the row — `// @vitest-environment node` — in `src/db/repositories/domains.test.ts`. (contracts/domains-repo.md; cascade itself already proven in 003's `integrity.cascade.test.ts`)

**Checkpoint**: Full Domains CRUD with a safe, honest delete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T030 [P] Test: **keyboard/a11y automation** (complements the manual pass) — under `MemoryRouter`, assert sidebar `NavLink`s are reachable/operable by keyboard and the active one exposes `aria-current`; the create form's inputs have associated labels and submit via keyboard; the delete dialog closes on Escape — in `src/app/a11y.test.tsx`. (FR-014/SC-007)
- [X] T031 [P] Verify **no network surface** (FR-013): confirm `src/app/**` introduces no `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` / HTTP-client usage and that routing (HashRouter) is local-only; the sole outbound-capable code remains the (unused-here) 003 path. Note the result; if warranted, add a `no-restricted-globals`/`no-restricted-syntax` ESLint guard.
- [X] T032 [P] Accessibility manual pass (FR-014/SC-007): keyboard-only walk sidebar → topbar → content; `aria-current` on the active nav item; form labels + `aria-describedby` errors; dialog focus-trap + Escape + focus-return; color radiogroup labelled and not color-only. Fix any gaps in the layout/route components.
- [X] T033 Run `npm run build` (tsc strict + Vite) — clean; confirm the build graph still excludes `src/db/adapters/node.ts` (tests-only).
- [X] T034 Run `npm run test` (all suites green, incl. the existing 002/003 tests) and `npm run lint` (ESLint clean). (SC-005)
- [ ] T035 Manual runtime check: `npm run tauri dev` → shell renders, store shows loading→ready (and a clear error if pointed at a bad store), create/edit/delete a Domain and confirm it persists across a relaunch. (GUI/runtime — user; backs FR-011/SC-004 end-to-end)
- [X] T036 Prepare the end-of-feature walkthrough (shell + provider lifecycle, routing, the Domains flow + optimistic reconcile, repo additions, FR→verification, design rationale + alternatives, PRD §12 Phase 0 link). (SOP)

---

## Dependencies & Execution Order

### Phase order

- **Setup (P1)** → **Foundational (P2)** → **US1 (P3)** → **US2 (P4)** → **US3 (P5)** → **US4 (P6)** → **Polish (P7)**.
- **Foundational blocks everything** — `DbProvider` (T002) is consumed by US1's gate and by every Domains story's data access.
- **US2–US4 depend on US1's shell** (a route + the provider gate) but not on each other's *logic*; they touch overlapping files (`DomainsRoute`, `useDomains`), so run them in order rather than in parallel.

### Within stories

- US1: Topbar (T005) + placeholder routes (T007) are [P]; Sidebar (T006) needs the nav config (T004); AppShell (T008) needs the provider + Sidebar + Topbar; router (T009) needs AppShell + routes; main rewire (T010) needs the router; tests (T011/T012) need the provider/router.
- US2: palette (T013) is [P]; `useDomains` (T014) needs the provider; `DomainForm` (T015) needs the palette; `DomainsRoute` (T016) needs both; route-swap (T017) follows; tests (T018/T019) need the route; the restart test (T020) needs only the 003 repos (data layer).
- US3: repo `updateDomain` (T021) is [P] (data layer); UI edit (T022) needs the form/route + T021; tests (T023/T024) follow.
- US4: repo `deleteDomain` (T025) and the dialog (T026) are [P]; wiring (T027) needs both + the route; tests (T028/T029) follow.

### Parallel opportunities

- Foundational: T002, T003, T004 are different files — T003/T004 [P]; T002 is the critical one.
- US1: T005 ∥ T007. US2: T013 ∥ early work; the restart test (T020) ∥ the UI tests (different file). US3/US4: the repo additions (T021, T025) can be written alongside their story's UI (different files).
- Polish: T030/T031/T032 are independent ([P]); the build/test/lint gates (T033/T034) run after them.

---

## Parallel Example: Foundational + US1 start

```text
# After T001:
T002 DbProvider        (critical path)
T003 Placeholder.tsx   [P]
T004 navigation.ts     [P]
# Then US1:
T005 Topbar.tsx        [P]   T007 Dashboard/Courses/Review routes [P]
```

---

## Implementation Strategy

### MVP first (US1)

1. Setup → Foundational → US1. **Stop and validate**: a navigable window with sidebar/topbar that shows loading → ready, an error panel on store failure, and routes to each (placeholder) destination. That alone is the Phase 0 "navigable native window" increment.

### Incremental delivery

1. Setup + Foundational → provider + shared route bits.
2. US1 → navigable shell + store-health gate → **MVP**.
3. US2 → create + list Domains + restart-durability (first data-backed screen; the "read/write SQLite from the UI" payoff).
4. US3 → edit. 5. US4 → delete (safe + honest). 6. Polish → a11y (automated + manual), no-network check, build/test/lint, runtime check, walkthrough.

### Notes

- All Domain reads/writes go through the 003 repositories via `useDb()` — never raw SQL or the plugin (Constitution IV).
- Validation runs before the optimistic apply; the only failures to reconcile are genuine persistence errors (research R4) — tested on the create (T019), edit (T023), and delete (T028) paths.
- `node:sqlite` works under jsdom (research R2), so UI tests exercise real persistence; the repo-addition + restart-durability tests use the node env.
- The runtime check (T035) needs the GUI — that part is the user's.
