# Implementation Plan: App Shell, Navigation & Domains Management

**Branch**: `004-app-shell-domains` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-app-shell-domains/spec.md`

## Summary

Stand up the `src/app/` shell: React Router routing, a sidebar + topbar layout built from the Feature 002 design-system components (Obsidian theme), and a `DbProvider` that owns the Feature 003 `SqlExecutor` lifecycle and exposes it to the React tree with explicit **loading / error / ready** states. On top of the shell, ship the first data-backed screen — **Domains management** (list, create, edit, delete) — reading and writing through the existing 003 domains repository (plus additive `updateDomain` / `deleteDomain`). This hits the Phase 0 milestone of a navigable native window reading/writing local SQLite, and generalizes hard-coded domains into user-defined ones. No vault/FS, no AI, no network.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19.

**Primary Dependencies**: `react-router-dom` (**new** — routing) · the Feature 002 component kit (`src/components/ui`) · the Feature 003 data layer (`src/db`: `SqlExecutor`, `initDatabase`, domains repo, `DomainSchema`) · zod (form validation, already present).

**Storage**: Local SQLite via the 003 `SqlExecutor` seam — this feature never touches SQL or the plugin directly; it calls repositories.

**Testing**: Vitest + Testing Library (jsdom) for the shell/screens; the Domains flow is exercised against a real in-memory `node:sqlite` executor injected into `DbProvider` through the 003 seam (fallback: an in-memory fake `SqlExecutor` if `node:sqlite` can't load under jsdom — see research R2).

**Target Platform**: Windows 11 desktop (the 001 Tauri webview). Routing must work inside the packaged webview without a server resolving paths (research R1).

**Project Type**: Desktop app — adds the frontend `src/app/` shell + one feature screen; no backend.

**Performance Goals**: Interactive-instant at personal scale (tens of domains). Optimistic create/edit so the list updates without a perceptible wait.

**Constraints**: Fully local, zero network (FR-013). Store failures must surface as UI state, never a blank screen (FR-003). Keyboard-operable + labelled for assistive tech (FR-014). Optimistic writes must reconcile on failure (FR-012).

**Scale/Scope**: One app shell (router + provider + sidebar/topbar), ~4 placeholder routes + the StyleGuide route, one full Domains screen (list/empty/create/edit/delete), two additive repo functions, and the test set.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Status | Notes |
|---|---|---|---|
| **I. Vault is Canonical and Sacred** | No vault/FS access | ✅ PASS (vacuous) | This feature reads/writes **tracking data** (Domains) via the 003 SQLite layer only. No `.md`, no `tauri-plugin-fs`, no `VaultReader/Writer`. Knowledge is untouched. |
| **II. AI is Vendor-Agnostic Tutor** | No AI | ✅ PASS (vacuous) | No `Provider`, no SDK, no network. |
| **III. Preserve Desirable Difficulty** | No learning mechanics | ✅ PASS | Domains management is configuration. No SRS, no reveal-before-recall, no auto-"learned". Nothing here smooths a learning loop. |
| **IV. Interface-First, Deep Modules** | Directly | ✅ PASS | The UI depends on the **003 public surface** (`SqlExecutor`, repositories, models) — never raw SQL or the plugin. `DbProvider` is the React-tree composition root that wires the executor once and exposes it via a thin `useDb()` hook; screens call repositories. The provider accepts an injectable initializer so tests wire a `node:sqlite` executor without the Tauri path. No leaky abstraction (no Tauri/SQL types in component props). |
| **V. Spec-Driven Development** | Yes | ✅ PASS | Full Phase 1 doc set; git owned by user; end-of-feature walkthrough committed to; the data-touching surface (Domains create/list/edit/delete + provider states) is tested. |

**Technology constraints**: React + TS strict ✅, Tailwind/Obsidian theme ✅ (design follows [CIC-Design-Language-Obsidian.html] — purple brand, cyan reserved for AI only and **not used here**), React Router ✅ (named in the target structure). One **new dependency** — `react-router-dom` — flagged here; it is the locked routing choice in CLAUDE.md's target structure, not a new architectural decision.

**Gate result: PASS.** No violations; Complexity Tracking omitted.

## Project Structure

### Documentation (this feature)

```text
specs/004-app-shell-domains/
├── spec.md
├── plan.md                       # This file
├── research.md                   # Phase 0 — routing flavor, node:sqlite-under-jsdom, provider/test seam, optimistic reconcile, palette, a11y
├── data-model.md                 # Phase 1 — UI state models (DbState, DomainFormInput + validation), the 003 Domain reference, repo additions
├── quickstart.md                 # Phase 1 — run the app → shell + domains; how to test; a11y check
├── contracts/
│   ├── provider-and-routing.md   # DbProvider context/useDb() contract + the route table
│   └── domains-repo.md           # additive 003 repo surface: updateDomain / deleteDomain
└── checklists/requirements.md    # Spec quality checklist (green)
```

### Source Code (repository root)

```text
src/
├── app/                          # the React shell spine (new)
│   ├── router.tsx                # HashRouter route table → AppShell + routes
│   ├── providers/
│   │   └── DbProvider.tsx        # owns SqlExecutor lifecycle (loading/error/ready); useDb() hook
│   ├── layout/
│   │   ├── AppShell.tsx          # sidebar + topbar + <Outlet/>; renders DB loading/error gate
│   │   ├── Sidebar.tsx           # nav destinations (NavLink + aria-current)
│   │   └── Topbar.tsx
│   └── routes/
│       ├── Placeholder.tsx       # reused "coming later" screen
│       ├── DashboardRoute.tsx    # placeholder
│       ├── CoursesRoute.tsx      # placeholder
│       ├── ReviewRoute.tsx       # placeholder
│       └── domains/
│           ├── DomainsRoute.tsx  # list + empty state + create/edit/delete orchestration
│           ├── DomainForm.tsx    # name + palette color picker (create & edit)
│           ├── DeleteDomainDialog.tsx  # confirmation w/ cascade warning
│           └── useDomains.ts     # list/create/edit/delete state, optimistic + reconcile
├── components/ui/                # existing (Feature 002) — Panel, Button, Callout, Tag, …
├── db/                           # existing (Feature 003) — + updateDomain/deleteDomain in repositories/domains.ts
├── styleguide/                   # existing — reachable at /style
└── main.tsx                      # mounts <DbProvider><RouterProvider/></DbProvider> (init moves into the provider)
```

**Structure Decision**: `src/app/` is the React shell the CLAUDE.md target structure names. The **`DbProvider` is the composition root** for the UI (Constitution IV): it calls the 003 `initDatabase()` once, tracks the store lifecycle, and hands the `SqlExecutor` down via `useDb()`; feature screens depend on that interface + the repositories, never on the plugin. Routing is **HashRouter** (robust inside the packaged webview without server path resolution — research R1). The Domains screen is the only data-backed route; the rest are placeholders so the IA is real and navigable now. The fire-and-forget `initDatabase()` currently in `main.tsx` (003) moves into `DbProvider`, which is the correct owner of that lifecycle and state.

## Phase 0 — Research

See [research.md](research.md). Resolves: routing flavor for a Tauri webview — **HashRouter**, declarative routes (R1); whether `node:sqlite` loads under Vitest's jsdom env so component tests can hit real persistence, with a seam-based fake fallback (R2); the `DbProvider` lifecycle + injectable-initializer test seam and the `useDb()` contract (R3); the optimistic-create/edit + reconcile-on-failure pattern (FR-012) (R4); domain color selection from the `--color-domain-1..5` palette tokens and what gets stored (R5); accessibility patterns for the sidebar nav + forms + destructive-confirm dialog (R6).

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the UI/state models this feature introduces: `DbState` (loading | error | ready), `DomainFormInput` (name + palette color) with its zod validation (required/non-blank/unique name, palette-bounded color, length cap), a reference to the existing 003 `Domain` entity (no schema change), and the additive repo functions.
- [contracts/provider-and-routing.md](contracts/provider-and-routing.md) — the `DbProvider` context shape + `useDb()` hook contract (the stable surface screens depend on) and the route table (path → screen, which are placeholders).
- [contracts/domains-repo.md](contracts/domains-repo.md) — the additive 003 domains-repository surface (`updateDomain`, `deleteDomain`) with signatures and validation/cascade semantics.
- [quickstart.md](quickstart.md) — run the app → navigable shell + working Domains screen; how to run the tests; how to verify keyboard-only operation.

## Complexity Tracking

No constitution violations — section intentionally empty.
