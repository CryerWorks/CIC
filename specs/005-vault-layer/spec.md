# Feature Specification: Vault Layer (VaultReader / VaultWriter)

**Feature Branch**: `005-vault-layer`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Feature 005 — Vault layer (VaultReader / VaultWriter). The local-Markdown persistence foundation for all knowledge (PRD §6/§13, Constitution I): the single, safe path through which the app reads and writes the user's Obsidian vault."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Safely store and retrieve a note (Priority: P1) 🎯 MVP

As the app, I write a note (structured metadata + human-readable Markdown body) into the user's vault as a clean `.md` file, and later read it back with the metadata parsed and validated — so the vault is the canonical home for knowledge and what the app writes is exactly what a person sees in Obsidian.

**Why this priority**: This is the irreducible core — without a safe write→read round-trip there is no vault integration. Everything else (conflict safety, path scoping) layers on top. It is the foundation every knowledge feature builds on.

**Independent Test**: Write a note with frontmatter + body to a (temp) vault, read it back; the body is byte-faithful, the frontmatter parses and validates against a supplied schema, and the file on disk is clean Markdown. Reading a note with malformed frontmatter returns a clear failure instead of crashing.

**Acceptance Scenarios**:

1. **Given** a note with frontmatter and a Markdown body, **When** the app writes it, **Then** a clean `.md` file exists at the target path with the frontmatter serialized as a standard fenced block above the body.
2. **Given** a previously written note, **When** the app reads it with a metadata schema, **Then** it receives the parsed+validated frontmatter, the body, and the raw text.
3. **Given** a note whose frontmatter violates the supplied schema or is not parseable, **When** the app reads it, **Then** it receives a clear, typed failure (not a crash, not a silent wrong value).
4. **Given** a write in progress, **When** it completes, **Then** no temporary or half-written file is observable — the note appears complete or not at all.

---

### User Story 2 - Never clobber the user's own edits (Priority: P2)

As the user, when I have edited a note in Obsidian since the app last wrote it, the app must not silently overwrite my changes — it detects the external edit and refuses to write, preserving my work, until the conflict is resolved.

**Why this priority**: This is the **highest-risk integration point** (PRD §13). The vault is sacred; a single silent clobber of a user's notes is a project-defining failure. It depends on US1's write path but must be in place before any feature writes to real vaults.

**Independent Test**: Write a note (recording its fingerprint); modify it externally; attempt another app write → it is refused with a conflict result and the external content is intact. Then write to an unchanged note → it succeeds and the recorded fingerprint advances. An explicit override writes despite the conflict.

**Acceptance Scenarios**:

1. **Given** a note the app wrote, **When** the file is changed outside the app and the app attempts to write it again, **Then** the write is refused, a conflict is reported, and the file is left exactly as the external edit left it.
2. **Given** a note unchanged since the app's last write, **When** the app writes it, **Then** the write succeeds and the app's recorded fingerprint is updated.
3. **Given** a conflict has been resolved, **When** the app writes with an explicit override, **Then** the write proceeds.
4. **Given** a file that exists on disk but the app has never written, **When** the app attempts to write it, **Then** it is treated as a conflict (not silently overwritten).
5. **Given** a read of a note that changed externally, **When** the app reads it, **Then** the change is surfaced as informational and the read still returns the current content (not blocked).

---

### User Story 3 - Stay inside the vault (Priority: P3)

As the user, I trust that the app only ever touches files inside the folder I pointed it at, and never my Obsidian configuration — so pointing CIC at my life's vault is safe.

**Why this priority**: A security/safety boundary. Important, and independently testable, but the round-trip and never-clobber guarantees are the headline value.

**Independent Test**: Attempt operations with paths containing `..`, absolute paths outside the vault, or the `.obsidian/` folder → each is rejected; valid in-vault paths (including subfolders) succeed.

**Acceptance Scenarios**:

1. **Given** a path that traverses outside the vault (e.g. contains `..`) or is absolute-outside, **When** any vault operation is called with it, **Then** it is rejected before any filesystem access.
2. **Given** a path inside the Obsidian `.obsidian/` configuration folder, **When** any operation targets it, **Then** it is rejected.
3. **Given** a valid path in a vault subfolder, **When** the app reads or writes it, **Then** it succeeds.

---

### Edge Cases

- **Malformed frontmatter on read** → typed failure, never a crash (US1 AS-3).
- **Crash mid-write** → atomic write guarantees the prior note (or nothing) remains; no half-written file (US1 AS-4).
- **External edit since last app write** → refused with a conflict (US2 AS-1).
- **File exists but app has no record of it** → treated as a conflict on write (US2 AS-4).
- **Read drift** → informational, non-blocking (US2 AS-5).
- **Path escaping the vault / `.obsidian/`** → rejected (US3).
- **Target folder doesn't exist yet** → created within the vault as needed for a write (assumption).
- **Empty body or empty frontmatter** → handled (a note may have only frontmatter or only a body).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST read a vault note and return its frontmatter (parsed metadata), its body, and the raw text as distinct parts.
- **FR-002**: The system MUST validate a note's frontmatter against a caller-supplied schema on read; malformed or invalid frontmatter MUST yield a clear, typed failure (never a crash, never a silently-wrong value).
- **FR-003**: The system MUST write a note by serializing frontmatter + body into clean, human-readable Markdown a person would be content to see in Obsidian.
- **FR-004**: Every `.md` write MUST go through the single VaultWriter using an atomic write, such that no partial or half-written file is ever observable and no temporary artifact remains after a successful write.
- **FR-005**: Before writing a note, the system MUST determine whether the file changed on disk since the app last wrote it, by comparing the file's current modification time and content fingerprint against the app's recorded values.
- **FR-006**: When an external change is detected, the system MUST refuse the write by default, report a conflict, and leave the file unchanged.
- **FR-007**: The system MUST provide an explicit override to write despite a detected conflict (for use only after the conflict has been resolved).
- **FR-008**: After a successful write, the system MUST record the file's new modification time and content fingerprint so subsequent writes can detect external changes.
- **FR-009**: A file that exists on disk but has no app-recorded fingerprint MUST be treated as a conflict on write (never silently overwritten).
- **FR-010**: On read, a detected external change MUST be surfaced as informational and MUST NOT block returning the current content.
- **FR-011**: All vault operations MUST be confined to the configured vault folder; any path that escapes it (traversal, absolute-outside) MUST be rejected before any filesystem access.
- **FR-012**: The system MUST never read from or write to the Obsidian `.obsidian/` configuration folder.
- **FR-013**: The system MUST be able to list the notes within the vault for consumers to enumerate.
- **FR-014**: The feature MUST operate fully locally, making zero network calls.
- **FR-015**: Access to `.md` files MUST be confined to the vault layer (reader/writer); no other part of the app performs ad-hoc filesystem writes to vault paths.

### Key Entities *(include if feature involves data)*

- **Vault note**: a Markdown file in the vault, conceptually = frontmatter (structured metadata) + body (human Markdown) + a vault-relative path. The vault is canonical for this content (Constitution I).
- **Vault-write record**: the app's last-written fingerprint of a file — its path, modification time, and content fingerprint. The primitive that powers conflict detection (PRD §13); lives in the tracking store, not the vault.
- **Conflict**: the condition where a file's current on-disk fingerprint differs from the app's recorded one (or no record exists) — signalling an external edit that must not be clobbered.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A note written by the app reads back with byte-faithful body and frontmatter that re-validates — 100% round-trip fidelity.
- **SC-002**: After any successful write, zero temporary/partial files remain and the note is complete.
- **SC-003**: 100% of writes to a file changed externally since the app's last write are refused (no clobber) unless an explicit override is supplied.
- **SC-004**: A note unchanged since the app's last write updates successfully, and its recorded fingerprint advances.
- **SC-005**: Malformed frontmatter is reported as a clear failure on read in 100% of cases, with zero crashes.
- **SC-006**: 100% of path inputs that escape the vault folder (or target `.obsidian/`) are rejected.
- **SC-007**: The read, write, conflict-detection, and path-scoping surfaces are covered by automated tests running against a real local filesystem, and all pass.

## Assumptions

- **Filesystem access** (constitution-locked inputs, not scope leakage): production uses the Tauri filesystem plugin; tests run against the real Node filesystem in temp directories — both behind a single low-level filesystem seam, so the layer's behavior is verified without the Tauri runtime. The filesystem bridge is confined to the vault layer's adapter files by the existing import-restriction rule (mirroring how the SQL plugin is confined to the data layer's adapters).
- **vaultPath is injected** at a composition root; the UI to choose/persist the vault folder is a later feature. This feature is a pure infrastructure layer with **no UI**, verified by tests (as Feature 003 was).
- **Frontmatter format** is YAML inside `---` fences (Obsidian-standard). The layer is generic — concrete note-type schemas (Course MOC, Project, …) are supplied by the features that own them; the vault layer validates against whatever schema it is given.
- **Content fingerprint** = the file's modification time + a content hash (SHA-256 of the file text). Recorded in the existing Feature 003 `vault_writes` table via small additive repository functions (record / get) — **no schema change**.
- **Unmanaged files** (present on disk with no app record) are treated as conflicts on write — the conservative choice that honors "never clobber."
- **Write creates intermediate folders** within the vault as needed; it never creates anything outside the vault.
- **One Rust touch**: register the Tauri filesystem plugin + a vault-scoped capability entry. Flagged per the constitution's "drop to Rust only when necessary, and flag it" rule.

### Out of scope (built by later features on top of this layer)

- The Course **MOC body template** and marker-delimited (`<!-- cic:* -->`) app-managed-section re-render (F1/F7).
- The **3-way diff conflict-resolution dialog** UI (§13 UI) — this layer provides the detection + the typed conflict result it will consume.
- The **live file-watcher reconcile loop** and the **backlink index** (F7).
- Course authoring, notes, or any **screen**; the **Course Blueprint**; all **AI** and embeddings.

### Dependencies

- **Feature 001** (Tauri shell) and **Feature 003** (SQLite data layer — the `vault_writes` table, the executor seam, and the migration runner) must be in place. This feature adds the `vault_writes` repository functions and consumes the executor to record/read fingerprints.
