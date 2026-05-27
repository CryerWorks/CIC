# Feature Specification: App Shell, Navigation & Domains Management

**Feature Branch**: `004-app-shell-domains`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Feature 004 — App shell, navigation & Domains management. The React app shell that hosts every screen, plus the first data-backed screen that exercises the SQLite data layer (Feature 003) end-to-end through the UI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A navigable window that surfaces store health (Priority: P1) 🎯 MVP

As a learner opening the app, I see a persistent navigation shell — a sidebar listing the app's primary destinations and a topbar — and I can move between destinations and always know whether my local data store is ready. While the store opens and migrates I see a clear loading state; if it fails I see an understandable error, never a blank or frozen window.

**Why this priority**: Nothing else can be reached without the shell, and the data layer (003) can fail to open or migrate — that failure must be visible. This story alone is a deployable increment: a real desktop window you can navigate, honestly reporting store status.

**Independent Test**: Launch with a healthy store → the shell renders, the default destination shows, every sidebar item navigates to its screen. Simulate a store that fails to open → an error state appears instead of content. Simulate a slow open → a loading state appears, then content.

**Acceptance Scenarios**:

1. **Given** the app launches and the store opens successfully, **When** the shell mounts, **Then** the sidebar, topbar, and the default screen are shown.
2. **Given** the shell is visible, **When** the user selects a different destination, **Then** the corresponding screen renders and the active destination is indicated.
3. **Given** the store is still opening/migrating, **When** the window is shown, **Then** a loading indicator is shown rather than empty content.
4. **Given** the store fails to open or migrate, **When** the window is shown, **Then** a clear error message is shown (not a blank screen, not a crash).
5. **Given** a destination is not yet implemented, **When** the user navigates to it, **Then** a placeholder screen clearly indicates it is coming later.

---

### User Story 2 - Create and see my Domains (Priority: P2)

As a learner, I open the Domains screen, and — because I have none yet — I see a guiding empty state inviting me to create my first subject area. I create a Domain by giving it a name and choosing a color; it appears in the list immediately and is still there when I reopen the app.

**Why this priority**: This is the feature's core value — generalizing hard-coded domains into user-defined ones (PRD §12 Phase 0) and proving the full stack (UI → data layer → local store → back) end-to-end. It is the first screen that reads and writes real data.

**Independent Test**: With an empty store, open Domains → an empty state is shown. Create a Domain with a valid name + color → it appears in the list. Reopen the store → the Domain is still listed. Attempt an invalid create (blank or duplicate name) → it is rejected with a clear message and nothing is added.

**Acceptance Scenarios**:

1. **Given** no Domains exist, **When** the user opens the Domains screen, **Then** a guiding empty state prompts creating the first Domain.
2. **Given** the create form, **When** the user submits a valid name and color, **Then** the new Domain appears in the list immediately (optimistic) and is persisted.
3. **Given** one or more Domains exist, **When** the user opens the Domains screen, **Then** each Domain is listed with its name and color.
4. **Given** a name that is blank, whitespace-only, or duplicates an existing Domain, **When** the user submits, **Then** the create is rejected with a clear message and no Domain is added.
5. **Given** a Domain was created, **When** the app is closed and reopened, **Then** the Domain is still present.
6. **Given** an optimistic create that then fails to persist, **When** the failure occurs, **Then** the UI reconciles (the phantom entry is removed) and an error is shown.

---

### User Story 3 - Edit a Domain (Priority: P3)

As a learner, I rename a Domain or change its color, and the change shows immediately and persists.

**Why this priority**: Refinement of management; valuable but not required to demonstrate the create/read core.

**Independent Test**: With an existing Domain, change its name and color → the list reflects the change immediately and it survives a reopen; an edit to a duplicate name is rejected.

**Acceptance Scenarios**:

1. **Given** an existing Domain, **When** the user changes its name and/or color and saves, **Then** the change appears immediately and is persisted.
2. **Given** an edit that would duplicate another Domain's name, **When** the user saves, **Then** it is rejected with a clear message and the original is unchanged.

---

### User Story 4 - Delete a Domain, knowingly (Priority: P3)

As a learner, I delete a Domain I no longer want, but only after the app makes clear that doing so will also remove everything beneath it (its Campaigns and Courses).

**Why this priority**: Completes management, but it is destructive and lower-frequency; the safety framing matters more than the feature.

**Independent Test**: Request deletion of a Domain → a confirmation appears stating the cascade consequence; cancelling leaves it intact; confirming removes it (and would remove its descendants) and it does not reappear after a reopen.

**Acceptance Scenarios**:

1. **Given** a Domain, **When** the user requests deletion, **Then** a confirmation is shown that explicitly states its Campaigns and Courses will also be removed.
2. **Given** the confirmation, **When** the user cancels, **Then** nothing is deleted.
3. **Given** the confirmation, **When** the user confirms, **Then** the Domain is removed, does not reappear after a reopen, and any descendants are removed with it.

---

### Edge Cases

- **Store fails to open/migrate** → the shell shows an error state with a readable message; the app does not crash or render blank (US1 AS-4).
- **Navigating before the store is ready** → destinations show a loading state, not a broken screen.
- **Duplicate or empty/whitespace Domain name** → rejected on create and on edit, with a clear message; nothing persisted.
- **Optimistic write fails** → the UI reverts the optimistic change and surfaces the error rather than leaving a phantom row.
- **Very long Domain name** → accepted within a sensible length limit and displayed without breaking the layout (truncated/wrapped).
- **Deleting a Domain with descendants** → the confirmation is honest about the cascade even though Campaign/Course screens don't exist yet.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST present a persistent navigation shell (a sidebar of primary destinations + a topbar) visible across all screens.
- **FR-002**: Users MUST be able to navigate between primary destinations, with the correct screen rendered for each and the active destination clearly indicated.
- **FR-003**: The shell MUST surface the local store's lifecycle to the user: a loading state while the store opens/migrates, a clear error state if it fails, and the app content once it is ready — never a blank or frozen screen.
- **FR-004**: Primary destinations that are not yet implemented MUST render a placeholder that clearly communicates they are coming in a later feature.
- **FR-005**: Users MUST be able to view all their Domains as a list, each showing its name and its color.
- **FR-006**: When no Domains exist, the system MUST show a guiding empty state that prompts the user to create their first Domain.
- **FR-007**: Users MUST be able to create a Domain by supplying a name and choosing a color; the new Domain MUST appear immediately (optimistic) and be durably stored.
- **FR-008**: The system MUST validate Domain input — a name is required (non-empty, non-whitespace) and unique among Domains; invalid input is rejected with a clear, user-facing message and nothing is persisted.
- **FR-009**: Users MUST be able to edit an existing Domain's name and color; valid changes appear immediately and are durably stored, subject to the same validation as creation.
- **FR-010**: Users MUST be able to delete a Domain; deletion MUST require explicit confirmation that states the cascade consequence (its Campaigns and Courses are also removed) before proceeding.
- **FR-011**: Domains created or edited MUST persist across app restarts.
- **FR-012**: If an optimistic create or edit fails to persist, the UI MUST reconcile (revert the optimistic change) and surface the error rather than leave the list inconsistent with stored data.
- **FR-013**: The feature MUST operate fully locally, making zero network calls.
- **FR-014**: All primary navigation and the Domain create/edit flows MUST be fully operable via keyboard, with labels and roles that assistive technologies can use.
- **FR-015**: Domain colors MUST be chosen from a predefined palette (rather than arbitrary free-form color entry) so that color choices remain visually consistent and legible against the app surface.

### Key Entities *(include if feature involves data)*

- **Domain**: a user-defined top-level subject area. Attributes: a unique, required name and a color drawn from the palette. Persisted by the existing data layer (Feature 003). This feature makes Domains user-managed rather than hard-coded.
- **Navigation destination**: a named, routable section of the app (e.g. Dashboard, Domains, Courses, Review). Exactly one is active at a time; some are fully implemented, others are placeholders for now.
- **Store connection state**: the local data store's lifecycle as the UI observes it — *loading* (opening/migrating) → *ready* (usable) or *error* (open/migrate failed). Drives what the shell shows.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any screen, a user can reach any primary destination in a single action, and the correct screen is shown each time.
- **SC-002**: A user with an empty store can create their first Domain in under 30 seconds, and it appears in the list without restarting the app.
- **SC-003**: 100% of store open/migration failures result in a visible, understandable error state — zero blank screens or crashes.
- **SC-004**: Domains created or edited in one session are present, unchanged, after the app is closed and reopened.
- **SC-005**: The create, list, and edit flows are covered by automated tests that run against real persistence, and all pass.
- **SC-006**: Whenever zero Domains exist, the Domains screen shows the guiding empty state.
- **SC-007**: Every primary navigation action and the entire Domain create/edit form can be completed using only the keyboard.

## Assumptions

- **Routing & UI building blocks** (constitution-locked, listed here as inputs, not as scope leakage): routing uses React Router; the sidebar/topbar and all screens are built from the Feature 002 design-system component vocabulary under the Obsidian theme (charcoal surfaces, purple brand, Inter/JetBrains Mono, soft radius) — explicitly **not** the war-room tactical HUD.
- **Data access** reuses Feature 003: a provider wraps its `initDatabase()` composition root and exposes the data layer to the UI; Domains are read/written through the existing domains repository, to which a small `updateDomain` (and, for US4, a delete) is added — additive to the spine, no schema change.
- **Deletion is in scope** as P3, with confirmation + an honest cascade warning. Risk is low today because Campaign/Course screens don't exist yet, but the schema cascade is real, so the warning is shown now.
- **Domain colors come from the predefined domain palette** (the design system's domain color tokens), not a free color picker — keeps contrast legible and the look consistent.
- **Primary destinations**: at minimum Dashboard, Domains, Courses, Review appear in the sidebar; only Domains is implemented this feature, the rest are placeholders. The exact destination list and labels are a design detail to settle during planning.
- **Single user, single window, desktop** — no authentication, accounts, or multi-window concerns.
- **Tests** exercise the provider's loading/error/ready states and the Domains create/list/edit flow against the `node:sqlite` executor through the real repositories (the Feature 003 testing seam), plus that routing renders the correct screen per destination.

### Dependencies

- **Feature 001** (Tauri + React + Vite shell), **Feature 002** (design system components + theme), and **Feature 003** (SQLite data layer: `SqlExecutor`, `initDatabase`, domains repository, models) must be in place. This feature consumes all three.
