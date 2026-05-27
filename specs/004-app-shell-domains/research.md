# Research: App Shell, Navigation & Domains Management

**Feature**: 004-app-shell-domains · **Date**: 2026-05-27

All decisions resolve the Technical Context. No `NEEDS CLARIFICATION` remain.

---

## R1 — Routing flavor for a Tauri webview

**Decision**: `react-router-dom` v7 with **`HashRouter`** and declarative `<Routes>`/`<Route>`. One `AppShell` layout route renders the sidebar/topbar + an `<Outlet/>`; child routes are the destinations. No data-router loaders — data flows through `DbProvider` + hooks.

**Rationale**: The packaged app loads from a custom protocol/asset origin with no server to resolve arbitrary paths; `BrowserRouter`'s history paths can break on reload/deep-link there. `HashRouter` keeps all routing in the URL fragment, so it works identically in `npm run dev`, `tauri dev`, and the packaged build with zero server config. Loaders/actions (data router) would couple routing to data fetching; our data lifecycle belongs to `DbProvider`, so plain declarative routes are simpler and match the feature's needs.

**Alternatives considered**: `BrowserRouter` — cleaner URLs but fragile under the packaged webview origin; rejected for a desktop SPA. `createMemoryRouter` — fine for tests but loses real back/forward + reload survival in the app; we'll use `MemoryRouter` *in tests* to mount routes deterministically, `HashRouter` in the app. Data router (`createHashRouter` + loaders) — more than this scope needs.

---

## R2 — Can `node:sqlite` run under Vitest's jsdom environment? (test strategy)

**Decision**: **Yes — verified.** A probe test (default jsdom env) opened `node:sqlite`, migrated, and round-tripped a domain successfully. So the Domains component tests render the screen in jsdom with a `DbProvider` wired to a **real in-memory `NodeSqlExecutor`** (through the 003 repositories) — true end-to-end UI↔persistence tests in one file. No `// @vitest-environment node` pragma needed for these (they need the DOM).

**Rationale**: Vitest's jsdom environment runs in the same Node worker with DOM globals layered on; Node core modules (`node:sqlite`) stay available. This lets the tests exercise the real repositories and SQLite semantics behind the actual UI, which is exactly the spec's intent (SC-005).

**Alternatives considered**: An in-memory **fake `SqlExecutor`** (the seam makes it trivial) — kept documented as a **fallback** if `node:sqlite` ever becomes unavailable under jsdom, but unnecessary today. Pure node-env data tests separated from jsdom render tests — rejected: it would split the create/list/edit flow from the UI that drives it, weakening the end-to-end guarantee.

---

## R3 — `DbProvider` lifecycle + the `useDb()` contract + test seam

**Decision**: `DbProvider` owns the store lifecycle as a discriminated union `DbState = { status: "loading" } | { status: "error", error: Error } | { status: "ready", db: SqlExecutor }`. It runs an **injectable initializer** — `initialize?: () => Promise<SqlExecutor>`, defaulting to the 003 `initDatabase`. On mount it sets `loading`, awaits the initializer, then `ready` or `error`. `AppShell` gates on this: loading → a loading panel, error → an error panel (with the message), ready → the routed content. A `useDb()` hook returns the `SqlExecutor` and **throws if called outside a ready provider** (a programming error — screens only render under `ready`).

**Rationale**: Centralizing the lifecycle (Constitution IV composition root) means screens never see "is the DB ready?" plumbing — they get a live executor or they don't render. The injectable initializer keeps Tauri out of jsdom tests (inject a migrated `NodeSqlExecutor`) and lets tests drive loading/error by controlling the promise (pending, reject, resolve). The throw-outside-ready keeps `useDb()`'s return type non-nullable, so screen code stays clean.

**Alternatives considered**: Fire-and-forget init in `main.tsx` (the 003 stopgap) with a nullable global — rejected: no first-class loading/error UI, and a nullable executor leaks null-checks into every screen. A loader-based data router that awaits the DB — rejected with R1 (couples routing to data).

---

## R4 — Optimistic create/edit + reconcile-on-failure (FR-012)

**Decision**: `useDomains()` holds the list in state, seeded by `listDomains`. A mutation (create/edit/delete) **applies optimistically** to local state, then calls the repository; on success it keeps the change (reconciling ids/values from the returned row), on failure it **reverts** to the pre-mutation snapshot and surfaces the error. Validation (zod) runs **before** the optimistic apply, so invalid input never mutates the list. Delete is optimistic-remove with the same revert-on-failure.

**Rationale**: FR-007/FR-012 require instant feedback that never leaves a phantom row. Snapshot-and-revert is the simplest correct optimistic pattern at this scale (tens of rows); a full re-fetch on every mutation would be heavier and flicker. Validating first means the only failures to reconcile are genuine persistence errors (rare locally).

**Alternatives considered**: Re-fetch the whole list after each mutation (no optimism) — simpler but a visible wait, against FR-007. A reducer/state library — overkill for one screen; plain `useState` + a snapshot suffices.

---

## R5 — Domain color selection + what is stored

**Decision**: The create/edit form offers the **five palette swatches** (`--color-domain-1..5`) as the only choices (FR-015). The selected swatch's **hex value** is stored in the existing `domains.color TEXT` column (003 schema, unchanged). Swatches are rendered as a radiogroup (keyboard-navigable), each labelled, with the active one indicated non-color-only (e.g. a check/ring) so the choice isn't conveyed by color alone.

**Rationale**: A bounded palette keeps domains visually coherent with the design system and sidesteps contrast/legibility problems a free picker invites. Storing the resolved hex (not a token name) keeps the 003 model untouched and self-describing; the palette tokens are the source of the offered choices. Non-color selection affordance satisfies a11y (don't rely on color alone).

**Alternatives considered**: Free-form color picker — rejected (FR-015: contrast/consistency risk). Storing a token name/index instead of hex — would require a 003 schema/semantics change and a lookup; rejected as unnecessary coupling.

---

## R6 — Accessibility patterns (FR-014)

**Decision**: Sidebar is a `<nav>` landmark of `NavLink`s; the active link carries `aria-current="page"` and a non-color-only active indicator. Full keyboard reach: tab order through nav → topbar → content; the create/edit form uses real `<label>`s tied to inputs, inline error text associated via `aria-describedby`, and focus moves to the first field on open and to the error on a rejected submit. The delete confirmation is a focus-trapped dialog (`role="dialog"`, `aria-modal`, labelled), Escape cancels, focus returns to the trigger on close. Color choice is a labelled radiogroup (R5).

**Rationale**: FR-014/SC-007 make keyboard + assistive-tech operation first-class. These are standard WCAG-aligned patterns; the Feature 002 kit (Button with `danger`, Callout with `warn`/`danger`, Panel) already provides the visual vocabulary, so this is wiring semantics, not new components.

**Alternatives considered**: A bespoke dialog without focus management — rejected (keyboard-trap/escape and focus return are non-negotiable for a destructive action). Title-attribute "labels" — rejected (not reliably announced); use real labels.

---

## Open questions

None. Vault/FS, dashboard data-viz, the war-room HUD port, FSRS, Resources/Projects screens, and AI are out of scope (spec). The one carried assumption — that `node:sqlite` stays loadable under jsdom — is now verified (R2), with the seam-based fake as a one-file fallback if that ever changes.
