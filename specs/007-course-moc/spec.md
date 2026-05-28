# Feature Specification: Course Authoring & MOC Materialization

**Feature Branch**: `007-course-moc`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Course authoring and MOC materialization (F1/F7, Phase 1) — manually create/edit a Course (title, Domain, optional Campaign, Capability paragraph, ordered Milestones); writing a Course materializes/updates its Obsidian MOC Markdown file using the locked v0.7 body template with app-managed `<!-- cic:* -->` markers; the reverse direction is read-back on app open + a manual rescan (no live watcher), preserving user-owned regions and surfacing drift rather than clobbering."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a Course and see it as an MOC in my vault (Priority: P1)

The learner creates a new Course: they give it a title, assign it to a Domain, optionally place it under a Campaign, write a one-paragraph **Capability** statement (what completing the Course proves they can do), and add an ordered list of **Milestones** (each a capability gate with a status). On save, a clean, human-readable Markdown MOC file appears in their Obsidian vault, containing the Capability paragraph and the Milestones list, ready to open in plain Obsidian.

**Why this priority**: This is the headline Phase-1 outcome — the moment a tracked Course becomes real Markdown the user owns in their own vault. Nothing else in the feature has value without it.

**Independent Test**: Against a connected vault, create a Course with two ordered milestones; confirm a new MOC file exists in the vault containing the title, the Capability paragraph, and both milestones in order, and that opening it in a plain Markdown viewer shows a sensible document.

**Acceptance Scenarios**:

1. **Given** a connected vault and an existing Domain, **When** the user creates a Course "Real Analysis" with a Capability paragraph and two ordered Milestones, **Then** a Markdown MOC file is created in the vault containing a `## Capability` paragraph and a `## Milestones` section listing both Milestones in order, **and** the Course is recorded in-app with a link to that file.
2. **Given** a Course was just created, **When** the user views the Courses list in-app, **Then** the new Course appears under its Domain (and its Campaign, if one was set).
3. **Given** no Domain exists yet, **When** the user opens Course creation, **Then** they are guided to create or select a Domain first (a Course cannot exist without a Domain).
4. **Given** the MOC file was created, **When** the user inspects it, **Then** it also contains clearly-marked, currently-empty placeholder sections for Resources, Active Projects, Recent Sessions, and Notes, plus a user-owned Reflections section that the app states it will never write to.

---

### User Story 2 - Edit a Course in-app and update its MOC without losing my own writing (Priority: P2)

The learner edits an existing Course — renames it, revises the Capability paragraph, adds / reorders / retires Milestones. On save, the MOC's app-managed sections are re-rendered to match, while anything the user wrote themselves (the Reflections section and any prose outside the app-managed regions) is left untouched. If the file was changed in Obsidian since the app last wrote it, the app does **not** silently overwrite — it surfaces the drift.

**Why this priority**: Editing is the day-2 reality, and the "never clobber my notes" guarantee is the trust contract that makes the vault-canonical premise safe. High value, but depends on US1 existing first.

**Independent Test**: Create a Course MOC, manually add a paragraph under the user-owned Reflections section in the file, then rename a Milestone in-app and save; confirm the Milestone change appears in the MOC and the hand-written Reflections paragraph is still present, unchanged.

**Acceptance Scenarios**:

1. **Given** an existing Course MOC with user-written text in the Reflections section, **When** the user edits a Milestone in-app and saves, **Then** the Milestones section updates **and** the Reflections text is unchanged.
2. **Given** an MOC that was edited in Obsidian after the app's last write, **When** the user saves an in-app change, **Then** the app detects the external change and surfaces it instead of overwriting (no data loss).
3. **Given** a Course is renamed in-app, **When** saved, **Then** the MOC reflects the new title and the Course's stored link to the file remains correct.
4. **Given** the user retires or removes a Milestone in-app, **When** saved, **Then** it is removed from the MOC's Milestones section while all content outside the app-managed regions is preserved.

---

### User Story 3 - Edit a Course MOC in Obsidian and have the app catch up (Priority: P3)

The learner edits a Course MOC directly in Obsidian — revises the Capability paragraph, edits a Milestone, adds a Milestone — then returns to the app. On app open (or via a manual "Rescan vault" action), the app reads the MOCs, recognizes the CIC Courses among them, and updates its records to match the files — including importing a Course MOC that exists in the vault but isn't yet known to the app.

**Why this priority**: Completes the "and vice versa" half of the Phase-1 milestone. The in-app → vault direction (US1/US2) is the more common path and must work first; this closes the loop.

**Independent Test**: With the app closed, edit a known Course MOC in a text editor (change the Capability paragraph and add a Milestone line within the managed section); reopen the app (or trigger Rescan) and confirm the Course's Capability and Milestones now match the file.

**Acceptance Scenarios**:

1. **Given** a Course MOC edited externally within its app-managed sections, **When** the app opens or the user triggers a Rescan, **Then** the Course's Capability and Milestones in-app match the file.
2. **Given** the vault contains a CIC Course MOC the app has no record of, **When** the app rescans, **Then** a corresponding Course is created in-app from the file.
3. **Given** a Markdown file in the vault that is not a CIC Course MOC, **When** the app rescans, **Then** it is ignored (never turned into a Course).
4. **Given** an MOC with malformed or unreadable content, **When** the app rescans, **Then** the app skips that file and surfaces a notice, without crashing or corrupting other data.

---

### Edge Cases

- **No vault connected**: Course authoring that would write to the vault is unavailable; the UI guides the user to connect a vault first (links to vault setup). A Course is not created in-app without somewhere to materialize it.
- **Duplicate titles**: Two Courses with the same title must not produce colliding MOC filenames; the system guarantees a distinct file per Course.
- **Pre-existing file at the target path** (not written by the app): never-clobber — the app does not overwrite it; it surfaces the conflict and does not lose the user's file.
- **External-edit drift on in-app save**: detected; surfaced to the user; never silently overwritten.
- **Read-back parse failure** (bad frontmatter / missing markers): the offending file is skipped with a surfaced notice; other files still reconcile.
- **Course deletion** (if offered): removes only the in-app record; the MOC file in the vault is never deleted by the app.
- **Campaign omitted**: a Course with no Campaign materializes and lists normally.

## Requirements *(mandatory)*

### Functional Requirements

**Course authoring**

- **FR-001**: Users MUST be able to create a Course with a title, an assigned Domain, an optional parent Campaign, a one-paragraph Capability statement, and an ordered list of Milestones.
- **FR-002**: Each Milestone MUST capture a capability statement, its position (order) within the Course, and a status.
- **FR-003**: Users MUST be able to edit an existing Course — its title, Capability statement, Campaign assignment, and Milestones (add, edit, reorder, retire).
- **FR-004**: The system MUST present the user's Courses grouped by Domain (and showing Campaign where set).
- **FR-005**: A Course MUST belong to exactly one Domain; the system MUST prevent creating a Course with no Domain.

**MOC materialization (in-app → vault)**

- **FR-006**: On creating or updating a Course, the system MUST write or update a single Markdown MOC file representing that Course in the connected vault.
- **FR-007**: The MOC MUST follow the locked body template — a Capability paragraph plus app-managed sections (Milestones populated now; Resources, Active Projects, Recent Sessions, and Notes written as clearly-marked empty placeholders) and a user-owned Reflections section.
- **FR-008**: The system MUST record and maintain a link from each Course to its MOC file.
- **FR-009**: The system MUST write only clean, human-readable Markdown that renders correctly in plain Obsidian with no third-party plugin required.
- **FR-010**: The system MUST preserve all user-owned MOC content across updates — the Reflections section and any content outside the app-managed regions MUST never be altered or removed by the app.
- **FR-011**: The system MUST never partially write or destructively overwrite an MOC; an interrupted write MUST NOT corrupt or truncate the file.
- **FR-012**: If an MOC changed externally since the app last wrote it, the system MUST detect this and surface it to the user instead of overwriting.
- **FR-013**: The system MUST guarantee each Course maps to a unique MOC file (no filename collisions between distinct Courses).
- **FR-014**: When no vault is connected, the system MUST NOT attempt a vault write and MUST guide the user to connect a vault first.

**Read-back (vault → in-app)**

- **FR-015**: On app open and on an explicit user-triggered Rescan, the system MUST scan the vault, recognize CIC Course MOCs, and update each corresponding Course's title, Capability, and Milestones to match the file's app-managed content.
- **FR-016**: The system MUST recognize a CIC Course MOC by a stable identity marker carried in the file, so that a renamed or moved file is still matched to the correct Course.
- **FR-017**: When a CIC Course MOC exists in the vault with no corresponding in-app Course, the system MUST create the Course from the file.
- **FR-018**: The system MUST ignore vault Markdown files that are not CIC Course MOCs (they are never turned into Courses).
- **FR-019**: On encountering an unreadable or malformed MOC, the system MUST skip it and surface a notice, without crashing and without corrupting other data.
- **FR-020**: The system MUST never delete a vault file as part of read-back or Course deletion (the vault is canonical and sacred).

### Key Entities *(include if feature involves data)*

- **Course** *(existing)*: the enrollable unit — title, the Domain it belongs to, optional Campaign, Capability statement, and a link to its MOC file.
- **Milestone** *(existing)*: a capability gate within a Course — a capability statement, an order within the Course, and a status.
- **Campaign** *(existing)*: an optional long-arc grouping that spans Courses.
- **Domain** *(existing)*: the top-level subject area a Course belongs to.
- **Course MOC** *(new artifact in the vault)*: the Markdown file representing a Course — a hidden identity marker plus the templated body (Capability paragraph, app-managed sections delimited by markers, and a user-owned Reflections section).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner can create a Course and have its MOC file appear in the vault with no manual file steps, within 2 seconds of saving.
- **SC-002**: 100% of in-app Course edits preserve user-owned MOC content (the Reflections section and any out-of-marker text) — zero data loss across edits.
- **SC-003**: After editing a Course MOC in Obsidian and rescanning, the app and the file agree in 100% of supported edit cases (Capability change; Milestone add / edit / reorder / retire).
- **SC-004**: Every materialized MOC renders as a sensible, readable document in plain Obsidian with no plugin installed — verifiable by opening the file.
- **SC-005**: No Course operation ever deletes, truncates, or partially corrupts a vault file — including under external-edit drift or an interrupted write (the never-clobber guarantee holds in 100% of cases).
- **SC-006**: A CIC Course MOC present in the vault but unknown to the app is imported as a Course on the next rescan, while non-CIC Markdown files are left untouched.

## Assumptions

- A connected vault (Feature 006) is a prerequisite for materialization; with no vault connected, Course authoring guides the user to connect one first rather than creating an unmaterializable Course.
- CIC Course MOCs are identified by a stable hidden identity marker in the file's frontmatter; files lacking it are treated as non-CIC and ignored by read-back. This marker is what lets a renamed/moved file still match its Course.
- Course MOCs live in a consistent, dedicated location within the vault (e.g. a `Courses/` subfolder); the exact location is an implementation/plan decision.
- The MOC body structure is the locked PRD v0.7 template. This feature populates Capability + Milestones and writes the remaining sections (Resources, Active Projects, Recent Sessions, Notes) as empty marked placeholders for later features to fill.
- Read-back treats only the app-managed sections as authoritative for app data; user-owned regions are read for preservation but never drive app records.
- "Rescan on app open" fires when the app starts or the vault becomes active; a manual Rescan action is also provided. Live file-watching is explicitly out of scope (deferred).
- If Course deletion is offered, it removes only the in-app record; the app never deletes the vault file.
- The existing Course / Campaign / Milestone / Domain data model and its repositories are reused as-is; no new persistent schema is introduced by this feature.
- Single local user; no authentication or multi-user concerns.

### Out of Scope (deferred to later features/phases)

- Resource registration and the `## Resources` section's live rendering (v0.8 / Phase 2).
- The Daily Loop, Sessions, Projects, and Notes that will populate the reserved placeholder sections.
- The backlink index, block-id management, and the graph view (F7 advanced).
- Live file-watcher two-way sync and the PRD §13 three-way-diff conflict-resolution dialog (this feature surfaces drift but does not resolve it interactively).
