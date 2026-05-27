# Feature Specification: SQLite Data Layer

**Feature Branch**: `003-sqlite-data-layer`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Feature 003 — SQLite data layer. The local persistence foundation for all tracking, scheduling, and SRS state (PRD §8). Knowledge stays in the Obsidian vault (canonical); SQLite holds tracking/SRS only. Wire the store + a versioned forward-only migration runner + zod-validated row models; model the full PRD §8 relational schema with FKs, enums, JSON columns, and M:N joins; enforce referential integrity. Out of scope: vector store/embeddings, the Course Blueprint IR, FSRS scheduling logic, the vault layer, all UI/AI."

## User Scenarios & Testing *(mandatory)*

> **Note on "user" for this feature.** This is invisible plumbing — there is no screen. The immediate beneficiary is **the application and the features built on it (the Daily Loop, SRS, authoring, generation)**, which need a reliable place to record tracking/scheduling/SRS state. The ultimate beneficiary is **the learner**, whose streaks, due cards, sessions, and course structure must persist faithfully across restarts and survive app upgrades without loss. Scenarios are framed around the data surviving and staying consistent.

### User Story 1 - The tracking store stands up and the core hierarchy persists (Priority: P1)

On first launch the application creates its local tracking store and lays down the schema automatically. A feature can record the spine of the learner's structure — a Domain, a Course within it (linked to its vault MOC file by path), and the Course's Milestones — and read it all back, with relationships intact, after the app is closed and reopened.

**Why this priority**: Without a store that reliably creates itself and round-trips the core hierarchy across restarts, nothing else in the platform can persist anything. This is the smallest end-to-end proof that local persistence works, and it is independently demonstrable.

**Independent Test**: Launch with no existing store → it is created with the schema. Record a Domain → Course → Milestones. Close and reopen the app. Read them back: all present, with the course still linked to its domain and milestones to their course.

**Acceptance Scenarios**:

1. **Given** no tracking store exists, **When** the application starts, **Then** the store and its full schema are created automatically with no manual step.
2. **Given** a Domain, a Course under it, and Milestones under the Course have been recorded, **When** the application is closed and reopened, **Then** all records are retrievable with their parent/child relationships intact.
3. **Given** an attempt to record a Course referencing a Domain that does not exist, **When** it is saved, **Then** it is rejected (referential integrity) rather than stored as an orphan.

---

### User Story 2 - The complete tracking domain is modeled with integrity (Priority: P2)

Every PRD §8 tracking entity is representable and durable: sessions, cards (with their scheduling state), reviews, streaks, pretest responses, first-class resources and their links to courses/sessions/cards/projects, and projects with their milestone and resource links. Constrained fields reject invalid values, and the many-to-many relationships can be linked and unlinked without harming the linked records.

**Why this priority**: The platform's features depend on the *full* model, not just the hierarchy. But the full model is only useful once the foundation (US1) works, so it follows. Integrity (rejecting bad data) is what makes the store trustworthy.

**Independent Test**: Record one of each entity and each relationship; confirm retrieval and that links resolve. Attempt invalid writes (bad enum value, malformed structured field, link to a missing parent) and confirm each is rejected with a clear error and nothing partially saved. Unlink a resource from a course and confirm the resource itself survives.

**Acceptance Scenarios**:

1. **Given** the schema, **When** one record of every §8 tracking entity is created with valid data, **Then** each persists and is retrievable with its relationships resolvable.
2. **Given** a write with an out-of-range enumerated value (e.g. an unknown resource kind or project status) or a malformed structured field, **When** it is saved, **Then** it is rejected with a clear error and no partial record is written.
3. **Given** a Resource linked to two Courses, **When** one Course removes the link, **Then** the Resource and its link to the other Course are unaffected.
4. **Given** a Course with child Milestones, Sessions, and Cards, **When** the Course is removed, **Then** its owned children are removed per the defined cascade while shared Resources are not deleted (only the links are).

---

### User Story 3 - The schema evolves safely across releases (Priority: P3)

As later features add or change tables, the store upgrades itself on launch: pending schema changes are applied once, in order, leaving existing data intact. Re-launching an already-current store changes nothing.

**Why this priority**: A personal tool lives for years across many app updates. If upgrading the app could lose or corrupt the learner's tracking history, the platform is untrustworthy. This matters, but only after there is a schema to evolve (US1/US2).

**Independent Test**: Take a store at an older schema version, launch the current app → it upgrades to the current version with all prior data intact. Launch again → no changes are applied (idempotent). Point the app at a store from a *newer* version → it refuses with a clear message rather than corrupting it.

**Acceptance Scenarios**:

1. **Given** a store at an older schema version with existing data, **When** the application starts, **Then** all pending upgrades are applied in order and the prior data is preserved.
2. **Given** a store already at the current version, **When** the application starts again, **Then** no schema change is applied.
3. **Given** a store at a *newer* version than the application understands, **When** the application starts, **Then** it refuses to operate on it and reports the mismatch clearly rather than risk corruption.

---

### Edge Cases

- **First run / missing store**: created automatically with the full current schema (US1 AS-1).
- **Store newer than the app (downgrade)**: refused with a clear version-mismatch error; never silently migrated down or corrupted.
- **Invalid write**: a bad enum, malformed structured field, or dangling foreign key is rejected atomically — no partial row, clear error.
- **Locked / corrupt store file**: the failure surfaces clearly; the app does not crash on a malformed store.
- **Deleting a parent**: owned children (a course's milestones/sessions/cards) follow the defined cascade; shared entities reached via M:N (resources) are not deleted — only the join links are.
- **Nullable relationships**: a session or card with no associated project, a course with no campaign, a resource never ingested — all valid states that must persist and read back as absent, not as errors.
- **Large history**: years of sessions/reviews/streaks must remain retrievable without degradation (a personal-scale, not web-scale, expectation).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On first launch the system MUST create its local tracking store and apply the complete current schema automatically, with no manual setup step.
- **FR-002**: The system MUST durably persist every PRD §8 tracking entity (see Key Entities) and retrieve it after an application restart with all relationships intact.
- **FR-003**: The system MUST enforce referential integrity: a record cannot reference a non-existent parent, and removing a parent applies a single, defined cascade/restrict behavior per relationship (owned children cascade; shared M:N links are removed without deleting the shared entity).
- **FR-004**: Before persisting, the system MUST validate constrained fields — enumerated fields (resource kind, resource role, session assignment kind, project status, milestone status, review rating, confidence rating, etc.) reject values outside their allowed set, and structured/JSON fields reject malformed shapes. An invalid write MUST be rejected with a clear error and MUST NOT partially persist.
- **FR-005**: The system MUST represent the many-to-many relationships (course↔resources, session↔assigned resources, card↔cited resources, project↔milestones, project↔resources) so that links can be added and removed independently of the linked records.
- **FR-006**: The tracking store MUST hold only tracking/scheduling/SRS state and string path-links to vault files. Knowledge/note bodies MUST never be stored here (the vault is canonical for knowledge).
- **FR-007**: The schema MUST be versioned. On launch the system MUST apply any pending forward changes exactly once, in order, and idempotently (an already-current store receives no changes), without data loss.
- **FR-008**: A store created by an earlier schema version MUST upgrade cleanly to the current version preserving all data; a store at a version newer than the application MUST be refused with a clear error.
- **FR-009**: After each successful vault write, the system MUST record the file path together with the app's last-written modification time and a content hash, so later external edits to that file can be detected. (The detection/conflict UX itself is the vault feature.)
- **FR-010**: All storage MUST be fully local — the layer makes no network calls and reads/writes a local file only.
- **FR-011**: The data-integrity behaviors (automatic schema creation, migration apply/idempotency/version-bump, referential-integrity enforcement, per-entity round-trip, and validation rejection) MUST be covered by automated tests.

### Key Entities

The complete PRD §8 tracking model. (`*_path` fields are string links to vault files, not embedded content.)

**Core hierarchy**
- **Domain** — a top-level subject area (name, color).
- **Campaign** — a long-arc objective within a Domain.
- **Course** — the enrollable unit; belongs to a Domain, optionally a Campaign; links to its vault MOC by path.
- **Milestone** — a capability gate within a Course (capability text, status, ordering).

**Sessions & SRS**
- **Session** — one Daily-Loop run for a Course (date, objective, minutes, whether retrieval happened, writeup path); optionally tied to a Project.
- **Card** — an SRS flashcard for a Course (front, back, scheduling state, due time, last-reviewed, source note path); optionally spawned from a Project.
- **Review** — one rating event on a Card (rating, optional confidence 1..5, timestamp, elapsed time) — supports calibration (F3.5).
- **Streak** — per-day activity (minutes, which domains were touched).
- **Pretest response** — a learner's pre-study answer in a session (question, response, whether revealed after) — supports errorful-generation (F2.5).

**Resources (first-class)**
- **Resource** — any studied reference material (title, one of 8 kinds, optional local file path, optional URL, kind-specific metadata, optional ingestion marker, added time). May exist without ever being AI-ingested.
- **Course↔Resource** — M:N link with a role (primary/secondary/reference).
- **Session↔Resource (assignment)** — what to read/watch/listen to/review in a session, with a locator and an assignment kind.
- **Card↔Resource (citation)** — M:N; a card cites resources at specific locators.

**Projects**
- **Project** — an applied-practice artifact for a Course (capability, status, opened/closed times, vault project-file path, optional template) — see F11.
- **Project↔Milestone** — M:N; a project exercises one or more milestones' capability.
- **Project↔Resource** — M:N; optional; a project may target specific resources/locators.

**Integrity**
- **Vault-write record** — per vault file, the app's last-written modification time and content hash, enabling external-edit detection for the conflict UX (§13).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **100%** of the PRD §8 tracking entities are persisted and retrievable.
- **SC-002**: Tracking data created in one run survives an application restart with **zero** loss and **all** relationships intact.
- **SC-003**: **Every** constrained field rejects invalid values — **zero** invalid writes accepted across the test suite, and rejected writes leave **no** partial records.
- **SC-004**: Starting the app against an already-current store applies **zero** schema changes (idempotent).
- **SC-005**: A store from a prior schema version upgrades with **zero** data loss; a newer-than-app store is refused **100%** of the time rather than corrupted.
- **SC-006**: **Zero** knowledge/note-body content is stored in the tracking store (only tracking state and path links).
- **SC-007**: **Zero** outbound network requests originate from the storage layer.
- **SC-008**: All listed data-integrity behaviors are covered by **passing** automated tests.

## Assumptions

- **Tech is pre-decided by the Constitution/PRD**: local SQLite via the Tauri SQL plugin, TypeScript access layer, zod validation. This spec describes the *outcome*; the locked choices come from the constitution.
- **Single-user, single-process desktop**: one local store, one writer. No multi-tenant, no concurrent external writers to the store file (the *vault* is the multi-writer surface, handled separately).
- **Stable string identifiers** for app-generated entities (so milestone/course/project IDs can be cross-referenced from vault frontmatter and the generation IR without collision). Recorded as an assumption; revisit if a simpler scheme suffices.
- **Cascade policy**: deleting an owning parent cascades to its owned children (e.g. a Course's milestones, sessions, cards); entities shared via M:N (resources) are never deleted by unlinking — only the join row is removed.
- **`*_path` and `*_at` semantics**: path fields are vault-relative or absolute string links (never content); time fields are stored in a consistent, sortable representation.
- **Scale is personal**: thousands of sessions/cards/reviews over years, not web-scale; no sharding/partitioning concerns.
- **Builds on Features 001–002**: the running shell exists; this feature adds persistence behind it and surfaces no UI.

### Out of Scope (Feature 003 — deferred)

- **Vector store / embeddings** (`chunks`, `resource_map`) — needs the vector extension and real embeddings; lands with the RAG/AI ingestion feature.
- **Course Blueprint IR** — a transient generation object (a type, not a table); lands with course generation.
- **FSRS scheduling logic** — only the card scheduling-state field and the reviews table exist here; the scheduling engine is the SRS feature.
- **The vault layer** — VaultReader/VaultWriter, the file-watcher, and the conflict-resolution UX. This feature only *records* the data the watcher will later read (the vault-write records).
- **All UI** (dashboards, course views) and **all AI**.
- **Data export/backup/sync** tooling.
