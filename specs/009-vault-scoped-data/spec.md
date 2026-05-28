# Feature Specification: Vault-scoped data (per-vault datasets)

**Feature Branch**: `009-vault-scoped-data`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Vault-scoped data (per-vault datasets) — Phase 1 hardening. Make each connected Obsidian vault have its own dataset of Domains, Campaigns, Courses, and Milestones, so the active vault determines what CIC shows and creates. Switching the active vault shows only that vault's data; switching back restores the previous vault's data losslessly. Refines Feature 006's deferred 'changing the vault does not migrate tracking data' — still one ACTIVE vault at a time, but data is partitioned by vault. Decisions: creation is gated on a connected vault; a vault is identified by a stable id stored in a hidden marker within the vault."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - My data follows the active vault (Priority: P1)

I keep two separate Obsidian vaults — one for Math, one for a language. When I point CIC at the Math vault I see only its Domains, Courses, and Milestones on the Dashboard and Courses screens. When I switch CIC to the language vault, those screens immediately show that vault's data instead — and switching back to Math shows my Math data again, untouched. Each vault is its own project; nothing bleeds across.

**Why this priority**: This is the whole feature — making the active vault the data boundary. It directly fixes the reported confusion (switching vaults kept showing the old vault's Courses) and is the slice that delivers the value on its own.

**Independent Test**: Create Courses in vault A; switch to vault B and confirm A's Courses are not shown; create different Courses in B; switch back to A and confirm A's Courses are intact and B's are absent — no restart, no data loss.

**Acceptance Scenarios**:

1. **Given** vault A has 3 Courses and vault B has 1, **When** the active vault is A, **Then** the Dashboard/Courses show A's 3 (not B's).
2. **Given** the active vault is A, **When** the user switches the active vault to B, **Then** every screen updates to B's data without an app restart.
3. **Given** the user switched A→B→A, **When** A is active again, **Then** A's data is exactly as it was (lossless round-trip).
4. **Given** data created before this feature exists, **When** the app upgrades, **Then** that data is assigned to the currently-configured vault so it still appears (nothing lost).

---

### User Story 2 - New data belongs to the active vault, and needs one (Priority: P2)

When I create a Domain or Course, it belongs to whichever vault is currently active. If no vault is connected, the management screens don't let me create orphaned data — they guide me to connect a vault first, the same way the Courses screen already does.

**Why this priority**: Scoping reads (US1) is only coherent if writes are scoped too and there's no way to create data with no home. It builds on US1's vault identity.

**Independent Test**: With vault A active, create a Domain → it appears under A and not under B. Disconnect the vault → the Domains and Courses screens show "connect a vault first" guidance and offer no create action.

**Acceptance Scenarios**:

1. **Given** vault A is active, **When** the user creates a Domain (and Courses/Milestones under it), **Then** they belong to A and appear only when A is active.
2. **Given** no vault is connected, **When** the user opens the Domains or Courses screen, **Then** it guides them to connect a vault first and does not offer to create data.
3. **Given** no vault is connected, **When** the user opens the Dashboard, **Then** it guides them to connect a vault (rather than showing another vault's data or a zero grid as if it were theirs).

---

### User Story 3 - My vault is recognized even if I move or rename its folder (Priority: P3)

If I rename my vault folder or move it elsewhere and then re-point CIC at it, CIC recognizes it as the same vault and shows my existing data — it does not treat the moved folder as a brand-new empty vault.

**Why this priority**: Robustness/trust. It's a refinement on top of US1/US2 (which work for a stable path), so it comes last — but it's why we chose a stored stable id over a path key.

**Independent Test**: Connect a vault and create data; rename/move the vault folder on disk; re-point CIC at the new location; confirm the same data appears (recognized by the stored id), not an empty vault.

**Acceptance Scenarios**:

1. **Given** a vault with data and a stored identity, **When** its folder is renamed/moved and reconnected, **Then** CIC recognizes the same vault and shows its data.
2. **Given** a vault that has no identity marker yet (e.g. created before this feature), **When** it is connected, **Then** CIC establishes its identity (creating the marker) and associates it with that vault's existing data rather than losing it.

---

### Edge Cases

- **No vault connected**: Domains/Courses creation is gated; the Dashboard guides the user to connect a vault. (US2)
- **Upgrade with pre-existing global data**: assigned to the currently-configured vault; if none is configured at upgrade, that data is adopted by the first vault connected (not stranded). (US1 AS-4, US3 AS-2)
- **Identity marker missing on connect** (older vault, or the user deleted it): CIC recreates it and re-associates the vault with its existing data by the previously-recorded folder path, rather than orphaning the data. (US3 AS-2)
- **Two folders sharing one identity** (the user copied a vault folder): CIC treats them as the same vault; the most-recently-connected path is the live location. (Documented limitation — full divergence handling is out of scope.)
- **Writing the marker fails** (read-only/locked vault): connecting fails gracefully with a surfaced error; CIC does not proceed with an unidentified vault.

## Requirements *(mandatory)*

### Functional Requirements

**Vault identity**

- **FR-001**: The system MUST represent each connected vault as a distinct record with a **stable identity** that persists across folder renames/moves.
- **FR-002**: On first connecting a vault, the system MUST establish its identity by storing a hidden identity marker **inside the vault**, written through the sanctioned vault layer — a dedicated atomic vault-write capability (the marker is hidden non-note metadata, so this need not be the Markdown-note writer); never overwriting or corrupting user content. On later connects it MUST read that marker to recognize the same vault.
- **FR-009**: The identity marker is CIC metadata, not user knowledge — it MUST live in a hidden, clearly-CIC location, MUST never overwrite a user file, and MUST never surface as a Course or Note.
- **FR-010**: If the identity marker is missing on connect, the system MUST recreate it and MUST re-associate the vault with its existing data via the previously-recorded folder path, rather than losing the association.

**Scoping**

- **FR-003**: Every Domain — and the Campaigns, Courses, and Milestones beneath it — MUST belong to exactly one vault.
- **FR-004**: The Domains screen, the Courses screen, and the Dashboard MUST show only the **active** vault's Domains/Courses/Milestones.
- **FR-005**: Newly created Domains (and the Campaigns/Courses/Milestones beneath them) MUST be attached to the active vault.
- **FR-007**: Switching the active vault MUST update all screens to the new vault's data **without an app restart**; switching back MUST show the prior vault's data intact (lossless).

**Creation gating**

- **FR-006**: When no vault is connected, the system MUST NOT allow creating Domains or Courses and MUST guide the user to connect a vault first (consistent with the existing Courses screen gate). The Dashboard MUST likewise guide the user to connect a vault rather than display another vault's data.

**Migration**

- **FR-008**: Domains/Courses/Milestones created before this feature MUST be assigned to the currently-configured vault on upgrade so nothing is lost; if no vault is configured at upgrade, that pre-existing data MUST be adopted by the first vault connected.

### Key Entities *(include if feature involves data)*

- **Vault** *(new)*: a connected Obsidian vault as CIC tracks it — a stable identity (from the in-vault marker), the current folder path, and the owner of a dataset. Exactly one is active at a time.
- **Domain** *(existing, now scoped)*: top-level subject area — now belongs to exactly one Vault. The scope anchor: Campaigns/Courses/Milestones inherit their vault through their Domain.
- **Campaign / Course / Milestone** *(existing)*: unchanged in shape; their vault is determined transitively via Domain (no direct vault link needed).
- **Identity marker** *(new, in the vault)*: a hidden CIC-owned file holding the vault's stable id; the source of vault identity across folder moves.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With two vaults holding distinct Courses, the active vault's Courses are the only ones shown 100% of the time; switching back restores the other vault's data with zero loss.
- **SC-002**: With a vault connected, a created Domain/Course is attached to it and appears only when it is active; with no vault connected, creation is blocked and the user is guided to connect one.
- **SC-003**: Renaming/moving the vault folder and reconnecting shows the same data (recognized by the stored id) in 100% of cases, never an empty vault.
- **SC-004**: Upgrading with pre-existing data assigns 100% of it to the current vault (or the first connected), losing none.
- **SC-005**: Every screen reflects a vault switch within ~1 second, with no app restart.

## Assumptions

- **Single ACTIVE vault at a time** (Feature 006 unchanged). Per-vault partitioning enables lossless switching but NOT simultaneous multi-vault views.
- **Scoping at the Domain level is sufficient** — Campaigns/Courses/Milestones already cascade under Domains, so a single vault link on Domain scopes the whole hierarchy; no per-entity vault field is added below Domain.
- The identity marker is a small hidden file in a CIC-owned location inside the vault; its exact path/format is an implementation detail for planning.
- Reuses the existing data model, repositories, and migration runner (Feature 003); this feature adds one additive schema migration plus a vault link on Domains.
- This **refines Feature 006's** "single active vault; changing the vault does not migrate tracking data" assumption — the PRD §8 data model and the 006 assumption will be reconciled (per Constitution V) as part of planning, since data is now vault-partitioned.
- Single local user; no authentication or multi-user concerns.

### Out of Scope (deferred to later features/phases)

- Multiple **simultaneous** vault views or a vault-library/switcher UI beyond the existing single "change vault" action.
- **Moving or copying** Domains/Courses between vaults.
- Reconciling SQLite against the vault's MOC files (the Feature 007 rescan/import already covers vault→DB reconciliation within a vault).
- Full handling of a **duplicated** vault folder diverging into two datasets (treated as the same vault for now).
- Any **AI** feature; and **FSRS / Sessions / Cards** data (Phase 2) — though once those exist they inherit the same per-vault scoping via their Course/Domain.
