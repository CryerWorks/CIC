# Feature Specification: Vault Configuration (choose & persist the Obsidian vault)

**Feature Branch**: `006-vault-config`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description (from session context): "The user-facing feature that lets a person point CIC at their Obsidian vault: choose the folder, remember it across restarts, authorize access to only that folder, confirm it's reachable, and make it available to the rest of the app. This is the gate before any knowledge feature can use the Feature 005 vault layer — it supplies the `vaultPath` that the 005 composition root currently has no caller for, plus the runtime access grant the Tauri filesystem needs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a vault on first run (Priority: P1) 🎯 MVP

As a new user, I point CIC at the folder that is my Obsidian vault, so the app has a canonical place to read and write my knowledge. Until I do this, the app does not touch any files; afterwards it confirms the folder is reachable.

**Why this priority**: This is the irreducible gate. CIC's entire premise is that knowledge lives in the user's vault (Constitution I); nothing in the knowledge half of the product can function until the user has designated that folder. It is the first thing a brand-new user must do.

**Independent Test**: Launch the app with no vault configured → a guided prompt invites the user to choose a folder. The user picks one via the OS folder chooser → the app stores it, reports that the folder is accessible (e.g. shows the folder and a count of Markdown notes found), and no read or write touched any other location.

**Acceptance Scenarios**:

1. **Given** the app has never had a vault configured, **When** it launches, **Then** it presents a clear, guided state inviting the user to choose their vault folder, and performs no vault reads or writes until one is chosen.
2. **Given** the guided state, **When** the user chooses a folder, **Then** the app records it as the active vault and confirms whether it is accessible for reading and writing.
3. **Given** a chosen, accessible vault, **When** the confirmation is shown, **Then** the user sees the configured location and a simple human-readable signal that the connection works (e.g. the number of Markdown notes found, which may be zero).
4. **Given** the folder chooser is open, **When** the user cancels without choosing, **Then** the configuration is left unchanged.

---

### User Story 2 - The vault is remembered across restarts (Priority: P2)

As a returning user, I don't want to re-select my vault every time I open the app — it should remember the folder I chose. If that folder has since moved, been deleted, or become inaccessible, the app must tell me clearly and let me re-choose, never crash, and never silently fall back to some other location.

**Why this priority**: Re-picking on every launch would make the app unusable for daily study. The graceful-recovery half is a safety requirement: a remembered path that is now invalid must never lead to touching the wrong folder. It depends on US1's storage but is independently valuable and testable.

**Independent Test**: Configure a vault, close and relaunch the app → the same vault is active without re-choosing. Then make the configured folder inaccessible (rename/remove it) and relaunch → the app surfaces a clear recovery prompt, does not crash, performs no reads/writes elsewhere, and offers to re-choose.

**Acceptance Scenarios**:

1. **Given** a vault was configured in a previous session, **When** the app launches again, **Then** the same vault is active and the user is not asked to choose again.
2. **Given** a previously-configured vault folder that is now missing or inaccessible, **When** the app launches, **Then** it surfaces this clearly, does not crash, accesses no other location, and prompts the user to re-choose.
3. **Given** a re-choose prompt after an invalid stored path, **When** the user selects a valid folder, **Then** the app proceeds normally with the new selection.

---

### User Story 3 - Change the vault later (Priority: P3)

As a user, I can change which folder CIC treats as my vault at any time from a settings surface, and I can always see which folder is currently active.

**Why this priority**: Useful for users who reorganize, switch machines, or initially picked the wrong folder — but it is a refinement on top of the first-run and persistence flows, which carry the headline value.

**Independent Test**: With a vault already configured, open the settings surface → the current vault location is displayed. Choose a different folder → the active vault updates, is confirmed accessible, and persists across the next restart. Selecting the same folder again is a no-op.

**Acceptance Scenarios**:

1. **Given** a configured vault, **When** the user opens the vault settings surface, **Then** the currently-configured location is displayed.
2. **Given** the settings surface, **When** the user chooses a different folder, **Then** the active vault updates to the new folder, its accessibility is confirmed, and the change persists across restarts.
3. **Given** the settings surface, **When** the user re-selects the folder that is already configured, **Then** nothing changes (idempotent).

---

### Edge Cases

- **First run, no vault** → guided empty state; no vault I/O attempted (US1 AS-1).
- **User cancels the folder chooser** → configuration unchanged (US1 AS-4 / FR-008).
- **Stored vault folder deleted / moved / permission-denied at launch** → clear recovery prompt, no crash, no access to any other location, re-choose offered (US2 AS-2 / FR-007).
- **Chosen folder is empty (no Markdown)** → valid; accessible with a note count of zero.
- **Chosen folder is very large** → confirmation may take a moment; the app shows an in-progress state rather than appearing frozen.
- **Re-selecting the already-configured folder** → idempotent, no disruption (US3 AS-3).
- **Folder is not actually an Obsidian vault (no `.obsidian/`)** → still accepted; CIC reads/writes Markdown regardless (the `.obsidian/` folder, if present, is never touched — Constitution I).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the user choose a folder on their computer to serve as their vault, via the operating system's native folder chooser.
- **FR-002**: After a folder is chosen, the system MUST determine whether it is accessible for reading and writing and report a clear result to the user.
- **FR-003**: The system MUST remember the configured vault across application restarts without requiring the user to re-choose it.
- **FR-004**: The system MUST authorize filesystem access to only the chosen vault folder and its contents — never the broader filesystem (least privilege).
- **FR-005**: When no vault is configured, the system MUST present a guided state prompting the user to choose one, and MUST NOT attempt any vault read or write until one is set.
- **FR-006**: The system MUST allow the user to change the configured vault at any time.
- **FR-007**: When a previously-configured vault folder is missing or inaccessible at launch, the system MUST surface this clearly, prompt the user to re-choose, and MUST NOT crash or read/write any other location.
- **FR-008**: If the user cancels folder selection, the system MUST leave the current configuration unchanged.
- **FR-009**: The configured vault location MUST be stored locally, as application state kept separate from the vault's own contents (never written into the vault).
- **FR-010**: Once a vault is configured, the system MUST expose a single, authoritative active-vault handle that the rest of the app uses to read/write knowledge (no second source of "which vault").
- **FR-011**: The system MUST display the currently-configured vault location to the user.
- **FR-012**: The system MUST confirm accessibility with a simple, human-readable signal (e.g. the count of Markdown notes found in the vault) so the user knows the connection works.
- **FR-013**: The feature MUST operate fully locally, making zero network calls.

### Key Entities *(include if feature involves data)*

- **Vault configuration**: the user's chosen vault folder location, stored locally as application state (not in the vault). The single source of truth for which vault is active. Conceptually one active value at a time.
- **Vault connection status**: a transient, derived signal — whether the configured folder is currently reachable for read/write, and a lightweight readability indicator (e.g. Markdown-note count). Not persisted; recomputed on launch and on change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can go from "no vault" to a configured, confirmed-accessible vault in under a minute and a handful of clicks.
- **SC-002**: After configuring once, the vault is still active on the next launch in 100% of cases, with no re-selection required.
- **SC-003**: 100% of filesystem access granted is confined to the configured vault folder; no access is granted beyond it.
- **SC-004**: When the configured folder is missing or inaccessible, the user sees a clear recovery prompt and the app does not crash, in 100% of such cases.
- **SC-005**: The configured vault location is always visible to the user and can be changed.
- **SC-006**: Zero network calls occur during vault configuration or confirmation.
- **SC-007**: Once configured, the rest of the app can obtain a working read/write handle to the vault — demonstrated by a successful read-back of the vault's contents (the note-count confirmation) in the running app.

## Assumptions

- **Single active vault.** CIC tracks one active vault at a time (the Constitution and PRD speak of "the user's Obsidian vault," singular). Multiple simultaneous vaults / vault-library management is out of scope.
- **Any folder may be a vault.** CIC does not require the chosen folder to already be an Obsidian vault (a `.obsidian/` folder is not required). If `.obsidian/` is present it is never read or written (Constitution I / Feature 005).
- **A folder path is not a secret**, so the configured location is stored in the existing local application store (the Feature 003 tracking database) as ordinary app state — not in the OS keychain, and never in the vault.
- **Reuses the Feature 005 vault layer.** Configuration supplies the `vaultPath` to the existing `createVault` composition root and wires its reader/writer into the app; this feature builds no new read/write/conflict logic.
- **Runtime access grant.** Read/write access to the chosen folder is authorized at runtime, scoped to that folder (least privilege), consistent with Feature 005's design (the static capability does not name the user's vault path).
- **Changing the vault does not migrate existing tracking data.** Local tracking records (e.g. SRS/card state, vault-write fingerprints) are keyed by path and simply persist; reconciling or migrating them across a vault change is out of scope.
- **No automatic writes on connect.** Confirming accessibility reads the vault (to count notes); it never writes a probe file into the user's vault.
- **One Rust touch (expected).** Registering the native folder-chooser bridge and granting the runtime folder scope. Flagged per the Constitution's "drop to native only when necessary, and flag it" rule — to be confirmed at plan time.

### Out of scope (built by later features)

- Browsing, opening, creating, or editing notes in the vault (knowledge features).
- The 3-way diff conflict-resolution dialog (PRD §13) and the live file-watcher / backlink index.
- Multiple vaults, vault libraries, or quick-switching beyond a single change.
- Migrating or reconciling existing tracking data when the vault changes.
- Any AI, embeddings, or course/Blueprint behavior.

### Dependencies

- **Feature 005** (vault layer — `VaultReader` / `VaultWriter` and the `createVault` composition root that takes a `vaultPath`).
- **Feature 003** (SQLite — to persist the configured vault location as local app state).
- **Feature 001 / 004** (Tauri shell + app shell/navigation — to host the configuration surface and provide the native folder chooser + runtime filesystem scope).
