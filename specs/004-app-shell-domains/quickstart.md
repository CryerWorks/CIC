# Quickstart: App Shell, Navigation & Domains Management

**Feature**: 004-app-shell-domains · **Date**: 2026-05-27

Goal: confirm the app opens to a navigable shell that honestly reports store health, and that Domains can be created/edited/deleted against the local store — all keyboard-operable.

## Prerequisites

Features 001–003 in place. New dependency: `react-router-dom`. The Tauri shell already compiles the SQL plugin (003).

## Run it

```powershell
npm install            # picks up react-router-dom
npm run tauri dev      # full app: shell + working Domains screen, reading/writing sqlite:cic.db
```

What you should see:
- A **sidebar** (Dashboard · Domains · Courses · Review · Style guide) + **topbar**; the active destination is indicated.
- While the store opens: a brief **loading** panel. If it failed: a clear **error** panel (try this by pointing at a bad store) — never a blank window.
- **Domains** (`/#/domains`): an empty state inviting the first Domain; create one (name + a palette color) and it appears immediately and persists across a relaunch. Edit renames/recolors; delete asks for confirmation that spells out the cascade.
- Placeholder screens for the other destinations.

`npm run dev` (frontend only, no Tauri) renders the shell but the store fails to open → you'll see the **error** state. That's expected; the real store lives under `tauri dev`.

## Verify the feature (tests)

```powershell
npm run test     # jsdom; the Domains flow runs against a real in-memory node:sqlite executor
```

| Check | Backs |
|---|---|
| `DbProvider` shows loading, then ready; on a rejecting initializer it shows error | FR-003 / SC-003 |
| Router renders the correct screen for each path (incl. placeholders) | FR-001/FR-002/FR-004 / SC-001 |
| Domains: empty state when none; create → appears + persists; list shows name+color | FR-005/FR-006/FR-007 / SC-002/SC-006 |
| Create/edit validation: blank, whitespace, duplicate name rejected, nothing added | FR-008 |
| Edit changes name/color and reads back; duplicate-name edit rejected | FR-009 |
| Optimistic create that fails reconciles (no phantom row) | FR-012 |
| Delete asks for confirmation; confirming removes the Domain | FR-010 |
| `updateDomain` / `deleteDomain` round-trip via the real repository | contracts/domains-repo.md |

## Verify accessibility (manual, quick)

- Tab from the top: focus walks sidebar → topbar → content; every nav item and form control is reachable and operable with the keyboard alone (SC-007).
- The active nav item is distinguishable without relying on color; the color picker is a labelled radiogroup; the delete dialog traps focus, Escape cancels, and focus returns to the trigger.

## Out of scope (so you don't look for it)

No vault read/write, no dashboard data-viz, no war-room HUD port, no FSRS/review, no Resources/Projects screens, no AI, no network. Those are later features. Domains is the only data-backed screen; the rest are placeholders.
