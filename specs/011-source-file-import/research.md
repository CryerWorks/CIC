# Research — Source File Import & Local Storage (011)

Phase 0 decisions. Each: **Decision / Rationale / Alternatives considered**.

---

## R1 — Where do internalized files live?

**Decision**: A per-machine, app-managed store rooted at the OS app-local-data directory: `appLocalData/resources/<resourceId>/<originalFilename>`. Resolved on the Rust side via `app.path().app_local_data_dir()`.

**Rationale**: It is unambiguously **outside the vault** (Constitution I — vault holds only Markdown). Per-resource subfolders make cleanup trivial (remove the `<resourceId>` dir) and let us keep the **original filename + extension** so the OS opens the file in the correct default app (FR-014). `app_local_data` (not `app_data`/roaming) signals "machine-local, not synced" — matching the per-machine assumption in the spec.

**Alternatives considered**:
- *Inside the vault* (e.g. an attachments folder) — **rejected**, violates Constitution I (no binaries in the vault; SC-005).
- *Flat store with content-hash filenames* — rejected: loses the original name/extension (hurts the opener), and dedup isn't a v1 goal; per-id folders are simpler to reason about and clean up.
- *Roaming `app_data`* — rejected: implies cross-machine sync of large binaries, which we explicitly do not promise.

---

## R2 — How is the file copied (native command vs. fs plugin)?

**Decision**: A custom Tauri (Rust) command `import_resource_file` using `std::fs::copy`. A sibling `remove_resource_files` uses `std::fs::remove_dir_all`. Both flagged as custom native code (Constitution Tech-Constraint).

**Rationale**: The **source** is an arbitrary path the user picked anywhere on disk. Reading it through `tauri-plugin-fs` would require granting broad, insecure JS read scope. Rust has full fs access with **no** added JS capability, copies in a single native call (no file bytes marshalled through the webview), and lets us **fix the destination base** so the JS-supplied `resourceId`/`filename` can't escape the store (path-traversal defense, R11). This mirrors the existing `grant_vault_access` custom command.

**Alternatives considered**:
- `tauri-plugin-fs` `copyFile` — rejected: `fs:allow-copy-file` isn't granted, and authorizing arbitrary source reads is a security regression.
- Read bytes in JS (`readFile`) then `writeFile` to the store — rejected: two ops, whole file through JS memory (bad for large media), still needs broad read scope.

---

## R3 — Where is the internalized path stored (new column vs. reuse `file_path`)?

**Decision**: Reuse the existing `resources.file_path` column to hold the internalized absolute path. No new "stored file" column.

**Rationale**: `file_path` already drives the citation opener (`resourceTarget` in `openTarget.ts` builds a `file://…#page=N` from it). Writing the internal path there makes citations open with **zero opener changes**. Cleanup keys off the per-resource store folder (R4), not off `file_path`, so we don't need an "is-internal" flag.

**Alternatives considered**:
- A separate `internal_path` column distinct from a user-typed `file_path` — rejected: redundant (the opener only needs one source path), and the spec internalizes file-kinds via the picker, so there isn't a competing user-typed path for file-kinds.

---

## R4 — How is cleanup done on Resource delete (FR-009 / US3)?

**Decision**: On delete, always call `removeSourceFiles(resourceId)` → the Rust `remove_resource_files` removes `appLocalData/resources/<resourceId>/` if present; a missing folder is a no-op (idempotent).

**Rationale**: Keying cleanup to the per-resource **folder** (not the filename in `file_path`) means it works regardless of the stored filename, survives a missing/edited `file_path`, and never errors when there's nothing to remove (FR-009 second clause). It runs *after* the DB cascade delete so a failed file removal can't block the row delete.

**Alternatives considered**:
- Delete by `file_path` — rejected: brittle if the path was edited/cleared; the folder is the durable handle.

---

## R5 — Home Domain: persisted column vs. derived from course links?

**Decision**: Add an **additive, nullable** `resources.domain_id TEXT REFERENCES domains(id)` (+ index) in migration `m0005`. A Resource may be unfiled (NULL).

**Rationale**: The spec (FR-012 / US4) wants a learner to **file** a Resource under a Domain — independently of which Courses it's linked to (and before any links exist). That requires an explicit attribute. Additive nullable columns are safe under the now-idempotent migration runner (see Feature 010's `fix(db)`); no table rebuild.

**Alternatives considered**:
- *Derive domain from linked courses' domains* — rejected: can't file an **unlinked** Resource, can't pick a single home Domain when courses span domains, and gives no stable filter key. The earlier Feature-010 polish already groups the *course-link picker* by domain (derived) for decluttering; this column is the orthogonal "home domain" the user asked for.
- *No persistence (transient UI filter)* — rejected: the user asked to "link resources to a domain", i.e. persist the association.

**PRD note**: PRD §8 models Resource↔Course (M:N), not Resource→Domain. This extends the model; reconcile the PRD during implementation (Constitution V — update the PRD first).

---

## R6 — Keeping the feature testable without Tauri (the `SourceFiles` seam)

**Decision**: Introduce a `SourceFiles` seam — `pickFile(kind)`, `importFile(sourcePath, resourceId, filename)`, `removeFiles(resourceId)` — with a Tauri-backed default (`@tauri-apps/plugin-dialog` + `invoke`) and a test fake injected the same way `renderApp` already injects `initialize`/`connect`.

**Rationale**: `invoke` and the OS dialog can't run under Vitest/jsdom. Isolating them behind a seam (mirroring `FolderPicker` in `vault/picker.ts` and `VaultConnector` in `vault/connect.ts`) keeps `useResources`/`ResourceForm` unit-testable and honours Constitution IV (features depend on interfaces, deep impls wired at the composition root).

**Alternatives considered**:
- Call `invoke`/dialog directly in the hook — rejected: makes the component suite require Tauri; inconsistent with the established vault DI.

---

## R7 — File picker UX (extension filters)

**Decision**: `pickFile(kind)` opens the native chooser with extension filters per kind (pdf→`pdf`; epub→`epub`; markdown→`md,markdown`; video_file→common video exts; audio→common audio exts), single-select, returns the chosen absolute path or `null` on cancel.

**Rationale**: Filters reduce wrong-type picks and match the existing `defaultPicker` shape. Single-select matches "one stored file per Resource" (FR-005).

**Alternatives considered**: no filter (rejected — worse UX); multi-select (rejected — one file per Resource).

---

## R8 — Re-import semantics (FR-005), failure-safe (analyze F1)

**Decision**: Re-picking for a Resource that already has a file **replaces** it via **copy-then-prune**: the Rust command copies the new file into the per-id folder **first**, and only *after* the copy succeeds removes any other (stale) files in that folder; then `file_path` is updated to the new path. One stored file per Resource; no history.

**Rationale**: Matches FR-005 (one file, replace) without violating FR-011/SC-002 on the replace path. The earlier "clear-then-copy" order was a defect: if the copy failed after the clear, the *previous* good file would already be destroyed and `file_path` left dangling — a partial-failure state. Copy-then-prune guarantees a failed re-import leaves the prior file (and `file_path`) untouched.

**Alternatives considered**: clear-then-copy (rejected — F1, loses the prior file on a failed copy); keep all old copies (rejected — orphan accumulation, no stated need).

---

## R9 — Migration version bump (the recurring chore)

**Decision**: Registering `m0005` makes the latest schema version **5**. Update the version-assertion tests (`migrate.test.ts`, `migrate.evolution.test.ts`, `migrate.lossless.test.ts`, `settings.test.ts`) from 4→5, and scope Feature 010's `migrate.srs.test.ts` self-heal/idempotent assertions (which assume 4 is latest) so they keep passing.

**Rationale**: These tests pin "latest version" to catch accidental schema drift; each additive migration legitimately bumps them. Documented so it isn't mistaken for a regression.

**Alternatives considered**: making the tests version-agnostic — out of scope; their pinning is intentional.

---

## R10 — Responsiveness during copy (FR-013)

**Decision**: `importFile` is awaited async; `ResourceForm` shows a "Copying…" busy state on the submit/Browse affordance while the native copy runs, and surfaces a clear error on failure (FR-011).

**Rationale**: A large media copy can take seconds; the UI must show progress, not appear frozen. The error path leaves the Resource with no `file_path` set (all-or-nothing, SC-002).

**Alternatives considered**: a progress bar with byte callbacks — rejected as overkill for v1 (a busy state suffices; the Rust `fs::copy` is a single blocking native op).

---

## R11 — Security: path-traversal & destination containment

**Decision**: The Rust command computes the destination **entirely server-side**: base = `app_local_data_dir()/resources`; it sanitises `resourceId` (accept only the UUID charset `[0-9a-fA-F-]`, reject anything else) and reduces `filename` to its **basename** (`Path::file_name`). The final path is `base/<resourceId>/<basename>`; if it doesn't canonicalise to within `base`, the command errors. No JS-supplied absolute/destination path is ever honoured.

**Rationale**: `resourceId`/`filename` cross the JS→Rust boundary; without sanitisation a crafted value (`../../…`) could write outside the store. Fixing the base + validating inputs closes this (and reinforces Constitution I — the command structurally cannot write into the vault).

**Alternatives considered**: trusting JS-supplied paths — rejected (injection surface).
