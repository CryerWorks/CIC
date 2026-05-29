# Feature Specification: Source File Import & Local Storage

**Feature Branch**: `011-source-file-import`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Source file import & local storage for Resources (Phase 2 storage foundation; the part of 'source ingestion' that has no AI). Let a user attach a real source file to a Resource by picking it via the native file explorer; the app copies ('internalizes') the chosen file into an app-managed store OUTSIDE the Obsidian vault and records it on the Resource. Citation deep-links then open the internalized file. When a Resource is deleted, its copy is removed. Applies to file-based Resource kinds; URL kinds keep their link field. Also decide whether a Resource carries a persisted 'home Domain' to declutter the registry. RAG ingestion is out of scope (later Phase-3 feature)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach a source file to a Resource (Priority: P1)

A learner registering or editing a file-based Resource (a PDF, EPUB, Markdown file, video file, or audio file) chooses the actual file from their computer using the system's file chooser. The app takes its **own copy** of that file into private app storage and remembers it on the Resource, so the source stays available to the app even if the learner later moves or renames the original.

**Why this priority**: Without a stored file, a file-based Resource is only a title — its citations cannot be opened and nothing exists for later study/AI features to read. This is the foundation everything else in the feature builds on.

**Independent Test**: Register a PDF Resource, pick a file, save; confirm the Resource reports an attached source and the original file on disk is unchanged (copied, not moved).

**Acceptance Scenarios**:

1. **Given** a new file-based Resource, **When** the learner picks a file and saves, **Then** the Resource shows it has an attached source file.
2. **Given** an existing file-based Resource with no file, **When** the learner picks a file, **Then** a private copy is stored and the learner's original file remains in place untouched.
3. **Given** a file-based Resource that already has a stored file, **When** the learner picks a different file, **Then** the new file replaces the stored copy.
4. **Given** a URL-based Resource (web page / video URL), **When** editing it, **Then** the learner sees a link field — not a file picker — and no file is stored.

---

### User Story 2 - Open a cited source from a card (Priority: P2)

During review (or from the card editor), a learner activates a citation to a file-based Resource and the source opens in the system's default viewer, positioned at the cited locator where the format allows (e.g., a PDF at a page).

**Why this priority**: This is the visible payoff — citations become actionable, which is the behavior that currently fails because file-based Resources have no file to open. It depends on User Story 1 (a file must be stored before it can be opened).

**Independent Test**: Attach a PDF to a Resource, cite it on a card with a page locator, then open it from the card/review; confirm the system viewer launches the stored file (at the page where supported).

**Acceptance Scenarios**:

1. **Given** a card citing a Resource that has a stored file, **When** the learner opens the citation, **Then** the stored file opens in the system's default viewer.
2. **Given** a stored PDF and a locator like "page=10", **When** the learner opens it, **Then** it opens at page 10 where the viewer supports page targets (otherwise the file still opens, just not page-positioned).
3. **Given** a Resource with no stored file and no URL (e.g., a physical book), **When** the learner views the citation, **Then** the open action stays disabled and the locator text is shown — never an error.

---

### User Story 3 - Reclaim storage when a Resource is removed (Priority: P3)

When a learner deletes a Resource, the app removes the private copy of its source file so storage is not silently consumed by orphaned files.

**Why this priority**: Housekeeping and data integrity. The feature is usable without it, but it would leak disk space over time and leave files with no owner.

**Independent Test**: Attach a file to a Resource, delete the Resource, then confirm the stored copy no longer exists.

**Acceptance Scenarios**:

1. **Given** a Resource with a stored file, **When** the Resource is deleted, **Then** its stored copy is removed.
2. **Given** a Resource whose stored file is already missing, **When** the Resource is deleted, **Then** deletion still succeeds without error.

---

### User Story 4 - Organize the Resource registry by Domain (Priority: P3)

A learner files a Resource under a Domain (e.g., "Baby Rudin" under Math) and filters the registry by Domain, so a growing library stays navigable and linking sources to the right courses is less guesswork.

**Why this priority**: Quality-of-life as the library grows; it declutters the registry and the course-linking picker. It is independent of file import and could ship separately, hence lower priority.

**Independent Test**: Assign a Resource to a Domain, filter the registry by that Domain, and confirm only matching Resources are listed.

**Acceptance Scenarios**:

1. **Given** several Resources across different Domains, **When** the learner filters by one Domain, **Then** only that Domain's Resources are listed.
2. **Given** a Resource filed under a Domain, **When** linking it to courses, **Then** the course choices can be narrowed to that Domain.

---

### Edge Cases

- **Large file**: Copying a large file proceeds without a hard size cap, but the interface gives feedback for the duration rather than appearing frozen.
- **Source unreadable / disappears mid-copy**: The import fails with a clear message and the Resource is left with **no** stored file (never a half-written copy).
- **Insufficient disk space**: The import fails clearly; no partial/corrupt copy is recorded against the Resource.
- **Same file used by two Resources**: Each Resource gets its **own** independent copy; deleting one does not affect the other.
- **Stored copy deleted out-of-band**: Opening a Resource whose stored copy was removed outside the app fails gracefully (no crash) and presents as "nothing to open" rather than an error.
- **Cross-machine**: A Resource imported on one computer may not have its stored file on another (the vault may sync, the app store does not); there, the open action is disabled and the locator is shown.
- **Deleting a Domain that has Resources filed under it**: the Domain delete succeeds and its Resources are simply **unfiled** (their home Domain is cleared); a Resource is never deleted as a side effect of deleting its home Domain.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to choose a source file from their computer via the operating system's native file chooser when registering or editing a file-based Resource (kinds: PDF, EPUB, Markdown, video file, audio).
- **FR-002**: On selection, the system MUST store its own copy of the chosen file in private, app-managed local storage and associate that stored copy with the Resource.
- **FR-003**: The system MUST leave the user's original file untouched — the import is a copy, never a move or modification.
- **FR-004**: The app-managed file store MUST live **outside** the user's Obsidian vault; no source-file bytes are ever written into the vault.
- **FR-005**: Re-picking a file for a Resource that already has one MUST replace the stored copy; a Resource references at most one stored file.
- **FR-006**: URL-based Resource kinds (web page, video URL) MUST continue to use a link/URL field and MUST NOT present a file picker or store a file.
- **FR-007**: Users MUST be able to open a Resource's stored file from its citations; where the format and the system viewer allow, the source MUST open positioned at the citation's locator (e.g., a PDF page).
- **FR-008**: When a Resource has no openable target (no stored file and no URL — e.g., a physical book), the open action MUST be disabled and the locator shown as text; the system MUST NOT raise an error.
- **FR-009**: When a Resource is deleted, the system MUST remove its stored file copy, and deletion MUST succeed even if the copy is already missing.
- **FR-010**: All import, open, and cleanup operations MUST be fully local — no network access is involved at any point.
- **FR-011**: If an import fails (file unreadable, insufficient space, cancelled), the system MUST report it clearly and leave the Resource with no partially-stored file.
- **FR-012**: Users MUST be able to assign a Resource to a Domain (optional) and filter the Resource registry by Domain.
- **FR-013**: Importing or opening a file MUST NOT leave the interface unresponsive without feedback for the duration of the operation.
- **FR-014**: The stored copy MUST retain enough of the original file's identity (name/extension) to open in the correct default application.

### Key Entities *(include if feature involves data)*

- **Resource** (existing): a studied source. This feature adds two notions to it — an optional **attached stored file** (the app-managed private copy, for file-based kinds) and an optional **home Domain** (for organizing/filtering the registry). URL kinds carry a link instead of a stored file.
- **Stored source file** (new): the app's private copy of an imported file. Owned by exactly one Resource, lives in app-managed local storage outside the vault, and is removed when its owning Resource is deleted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner can attach a source file to a Resource in under 30 seconds for a typical document (pick → stored → confirmed).
- **SC-002**: 100% of imports either fully succeed (a usable stored copy plus a recorded association) or fully fail with a message — never a half-stored or corrupt state.
- **SC-003**: After attaching a file, a learner can open it from a card citation and land on the cited location (page) for supported formats in a single action.
- **SC-004**: Deleting Resources reclaims 100% of their stored files — no orphaned copies remain in the store.
- **SC-005**: No source-file bytes are ever written inside the vault (verifiable: the vault contains only Markdown and CIC markers, never imported binaries).
- **SC-006**: Originally chosen files are never modified or moved (verifiable by comparing location and checksum before and after import).
- **SC-007**: A learner can narrow the Resource registry to a single Domain and see only that Domain's Resources.

## Assumptions

- The app-managed file store is **per-machine** (in the OS app-data location) and is **not** synced with the vault; a Resource imported on one machine may lack its stored file on another, which is acceptable (open is disabled there).
- Re-importing replaces the prior stored copy; this feature keeps no version history of stored files.
- There is no hard file-size limit in v1; very large files are permitted (disk space is the user's responsibility), but the UI provides feedback during the copy.
- Each Resource owns an independent copy; identical files across Resources are not de-duplicated in v1.
- A Resource's **home Domain** is optional (a Resource may be unfiled) and is independent of which Courses the Resource is linked to.
- Resources registered before this feature that hold a manually-entered external path keep working (their path opens as-is); retroactively internalizing them is out of scope.
- This feature depends on the existing Resource registry and card-citation surfaces (Feature 010).
- **Out of scope (explicit)**: RAG ingestion — chunking, embeddings, the vector store, and retrieval — is a later Phase-3 feature that depends on the AI provider layer. This feature provides only the local stored files such a feature would later read.
