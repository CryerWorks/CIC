---
description: "Task list for Feature 005 — Vault Layer (VaultReader / VaultWriter)"
---

# Tasks: Vault Layer (VaultReader / VaultWriter)

**Input**: Design documents from `specs/005-vault-layer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/vault-interface.md, contracts/vault-writes-repo.md, quickstart.md

**Tests**: INCLUDED. The constitution names vault read/write + conflict resolution as required test surfaces, and the spec lists the test set explicitly (SC-007). Test tasks are first-class here, not optional.

**Organization**: Tasks are grouped by user story (US1 round-trip / US2 never-clobber / US3 stay-inside-vault) so each is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)
- Every task names an exact file path.

## Path Conventions

Single project; source at repo root under `src/`. The vault spine is `src/vault/`; the additive 003 repo is `src/db/repositories/`. The one Rust touch is in `src-tauri/`. Tests live beside the code (`*.test.ts`), matching Features 003/004.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring in the two new dependencies, wire the native fs bridge, and extend the lint confinement — before any vault code exists.

- [X] T001 [P] Add `gray-matter` (frontmatter parse/serialize) to dependencies in `package.json`
- [X] T002 [P] Add `@tauri-apps/plugin-fs` (JS) to `package.json` and `tauri-plugin-fs` to `src-tauri/Cargo.toml`
- [X] T003 Register the fs plugin in `src-tauri/src/lib.rs` (`tauri_plugin_fs::init()`) and add a scoped capability entry (read/write/rename/stat/exists/readdir/mkdir) in `src-tauri/capabilities/default.json` — **the one flagged Rust touch (per constitution)**; note in the file that the vault *path* scope is granted at runtime (R1), not statically (depends on T002)
- [X] T004 [P] In `eslint.config.js`, add `@tauri-apps/plugin-fs` to the `no-restricted-imports` paths and add a `files: ["src/vault/adapters/**/*.{ts,tsx}"]` override turning the rule off there — mirroring exactly how `@tauri-apps/plugin-sql` is confined to `src/db/adapters/**`

**Checkpoint**: deps installed, fs plugin registered, lint will now reject any `tauri-plugin-fs` import outside `src/vault/adapters/**`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The filesystem seam, the pure shared primitives, and the interfaces every user story builds on. No story-specific behavior lives here.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T005 [P] Define the `VaultFs` seam + low-level types (`VaultStat { mtimeMs }`, `VaultDirent { name, isDirectory }`) in `src/vault/fs.ts`, per contracts/vault-interface.md (interface only — no implementation)
- [X] T006 [P] Define the typed result/error shapes in `src/vault/errors.ts`: `Fingerprint { mtime; hash }`, `WriteResult` (`written | conflict`), the read parse-failure type (`ReadOutcome<T>`), and `VaultPathError` (per data-model.md)
- [X] T007 [P] Implement the **pure** path validator+resolver `resolveVaultPath(vaultPath, relPath): string` in `src/vault/paths.ts`: reject absolute paths, any `..`/escaping segment, and anything under `.obsidian/` **before** returning; normalize and confirm the result stays inside `vaultPath`; tolerate Windows (`\`) and POSIX (`/`) separators (R6 — no I/O)
- [X] T008 [P] Implement `computeFingerprint` (mtime from `VaultFs.stat` + SHA-256 hex of file text via `crypto.subtle.digest`) and the content-change check in `src/vault/fingerprint.ts` (R5 — content identity decided by hash, not mtime)
- [X] T009 [P] Define the `VaultWriteLog` interface (`get(relPath)` / `record(relPath, fingerprint)`) in `src/vault/writeLog.ts` — the seam that keeps `src/vault` independent of `src/db` (R7; interface only)
- [X] T010 [P] Implement the **test** adapter `NodeVaultFs` over `node:fs/promises` in `src/vault/adapters/node.ts` (real temp-dir filesystem, real atomic `rename`, real mtimes; imported by tests only) (depends on T005)
- [X] T011 [P] Implement the **production** adapter `TauriVaultFs` over `@tauri-apps/plugin-fs` in `src/vault/adapters/tauri.ts` — the **only** importer of that plugin; not unit-tested (needs the Tauri runtime) (depends on T005)

**Checkpoint**: the seam, both adapters, path-safety, fingerprinting, and the write-log interface exist — reader/writer can now be built and tested against `node:fs`.

---

## Phase 3: User Story 1 - Safely store and retrieve a note (Priority: P1) 🎯 MVP

**Goal**: A safe write→read round-trip — write frontmatter + body as clean Markdown, atomically; read it back with frontmatter parsed and zod-validated; never crash on malformed frontmatter.

**Independent Test**: Against a temp vault (node adapter) with an in-memory `VaultWriteLog`: write a note → read it back; body is byte-faithful, frontmatter re-validates against a supplied schema, the on-disk file is clean Markdown, and no temp artifact remains. Reading a note with malformed frontmatter returns a typed failure, not a crash.

### Implementation for User Story 1

- [X] T012 [P] [US1] Frontmatter parse/serialize in `src/vault/frontmatter.ts`: split via `gray-matter`; `serializeNote(frontmatter, body)` → clean Markdown (empty FM → fence-less body); `parseNote` (throws only on unparseable YAML); `validateFrontmatter(data, schema)` → parsed value or a typed `FrontmatterParseError` (FR-002/003)
- [X] T013 [US1] Implement `VaultReader` (`exists`, `list(relDir?)`, `readNote`, `readNoteAs<T>(schema)`) in `src/vault/reader.ts` — resolves paths via `resolveVaultPath`, reads through `VaultFs`, parses via `frontmatter.ts`; `readNoteAs` returns a `ReadOutcome<T>` (validated note or typed parse failure), never throwing to a crash; `list` walks recursively skipping `.obsidian/` (depends on T005, T007, T012, T006)
- [X] T014 [US1] Implement `VaultWriter.writeNote` in `src/vault/writer.ts`: resolve via `resolveVaultPath`, create missing in-vault folders, serialize, **atomic** write (temp `*.cic-tmp` in the same dir → `rename`, best-effort temp cleanup on failure), compute + `record` the fingerprint via the injected `VaultWriteLog`, return `{ status: "written", fingerprint }`. (Implemented together with the US2 conflict machine — T020.) (depends on T005, T007, T008, T009, T012)

### Tests for User Story 1

- [X] T015 [P] [US1] Round-trip test in `src/vault/reader.test.ts`: write (frontmatter + body) then `readNoteAs(schema)` → body byte-faithful, frontmatter re-validates, raw present (wires `NodeVaultFs` on a temp dir + an in-memory `VaultWriteLog`). Also covers `exists`, `list` recursion/`.obsidian` skipping (G1/FR-013), and empty-body/empty-frontmatter/idempotent edges (G2) — SC-001
- [X] T016 [P] [US1] Atomic-write test in `src/vault/writer.atomic.test.ts`: after a successful write no `*.cic-tmp` remains and the note is complete; an overwrite replaces wholesale; intermediate folders are created — SC-002
- [X] T017 [P] [US1] Malformed-frontmatter test in `src/vault/frontmatter.test.ts`: unparseable / schema-violating frontmatter (and a missing note) on read → typed parse failure carrying the issue, zero crashes — SC-005

**Checkpoint**: the round-trip MVP is fully functional and testable on its own (no DB, no conflict logic yet).

---

## Phase 4: User Story 2 - Never clobber the user's own edits (Priority: P2)

**Goal**: Before every write, compare the on-disk fingerprint against the last recorded one; refuse and report a conflict on drift or on an unmanaged file; write + advance the fingerprint when unchanged; allow an explicit override. Surface read drift as informational, non-blocking.

**Independent Test**: Write a note (records fingerprint) → edit it externally → next write is refused with a `conflict` result and the external content is intact. Write an unchanged note → succeeds and the recorded fingerprint advances. A file present on disk with no record → `conflict`. An explicit `overwrite` writes despite the conflict. A read of an externally-changed note returns current content plus a drift signal.

### Implementation for User Story 2

- [X] T018 [P] [US2] Implement `recordVaultWrite(db, filePath, { mtime, hash })` (upsert on `file_path` via the 003 `upsert` helper) and `getVaultWrite(db, filePath)` (row parsed via `VaultWriteSchema`, or `null`) in `src/db/repositories/vaultWrites.ts`, per contracts/vault-writes-repo.md (depends on existing 003 `upsert`/`selectParsed` + `VaultWriteSchema`)
- [X] T019 [US2] Re-export `recordVaultWrite` / `getVaultWrite` from `src/db/index.ts` (additive to the 003 public surface) (depends on T018)
- [X] T020 [US2] Conflict state machine in `src/vault/writer.ts` (R5): `get` the recorded fingerprint, compute current; `fresh | managed-unchanged → write + record`; `drifted | unmanaged → { status: "conflict", reason, current, recorded? }` and **leave the file untouched**; `opts.overwrite` bypasses the check post-resolution but still records (FR-005/006/007/008/009). Content identity decided by **hash** (mtime-only churn is not a false conflict — R5). (depends on T014, T009)
- [X] T021 [US2] Surface informational, non-blocking **drift** on read in `src/vault/reader.ts` (`readNoteAs` compares current vs recorded fingerprint via the `VaultWriteLog`; returns current content regardless) (FR-010) (depends on T013, T020 semantics)
- [X] T022 [US2] Implement the composition root `createVault({ vaultPath, db })` in `src/vault/bootstrap.ts`: wire `TauriVaultFs` + a `VaultWriteLog` backed by the 003 `recordVaultWrite`/`getVaultWrite`, returning `{ reader, writer }` — the one place importing both the Tauri adapter and `src/db` (depends on T011, T013, T020, T019)

### Tests for User Story 2

- [X] T023 [P] [US2] Repo round-trip test in `src/db/repositories/vaultWrites.test.ts` (`// @vitest-environment node`, in-memory `node:sqlite` executor): `recordVaultWrite` → `getVaultWrite` returns the fingerprint; re-recording the same `file_path` updates in place (no duplicate) — contracts/vault-writes-repo.md
- [X] T024 [P] [US2] Conflict tests in `src/vault/writer.conflict.test.ts` (node adapter + in-memory log): external edit (mtime/hash drift) → write refused + file byte-intact (SC-003); unchanged note → write succeeds + recorded fingerprint advances (SC-004); on-disk file with no record → `conflict` (FR-009); `overwrite: true` → writes despite conflict and records (FR-007)
- [X] T025 [P] [US2] Read-drift test in `src/vault/reader.drift.test.ts`: a read after an external edit returns the current content **and** an informational drift flag, never blocking (FR-010)

**Checkpoint**: writes to the real vault are now never-clobber safe and wired end-to-end through the composition root; US1 + US2 both pass independently.

---

## Phase 5: User Story 3 - Stay inside the vault (Priority: P3)

**Goal**: Prove the security boundary holds at the public surface: only files inside `vaultPath` are ever touched, never `.obsidian/`, traversal/absolute-outside rejected before any I/O.

> The validator itself (`resolveVaultPath`, `src/vault/paths.ts`) is a Foundational primitive (T007) because reader and writer need it to resolve any path — building a resolver that lacks rejection, even transiently, is unacceptable on a "sacred vault." US3's deliverable is therefore the **verified guarantee**: a comprehensive rejection suite at the pure-function and the reader/writer surfaces.

**Independent Test**: Paths containing `..`, absolute-outside paths, and `.obsidian/` paths are each rejected before any filesystem access; valid in-vault subfolder paths succeed for both read and write.

### Tests for User Story 3

- [X] T026 [P] [US3] Pure path-safety unit tests in `src/vault/paths.test.ts`: `resolveVaultPath` rejects `..`/escaping, absolute-outside, and `.obsidian/...`; accepts a valid nested subfolder path and returns an absolute path inside `vaultPath`; covers Windows and POSIX separators — SC-006
- [X] T027 [P] [US3] End-to-end boundary test in `src/vault/paths.safety.test.ts` (node adapter on a temp vault): `reader.readNote` / `reader.list` / `writer.writeNote` reject unsafe paths **before** any I/O — assert no file is created, read, or modified outside `vaultPath` and nothing under `.obsidian/` is touched; a valid subfolder write+read round-trips

**Checkpoint**: all three stories pass independently; the path boundary is verified at both layers.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Assemble the public surface and confirm the whole layer is green.

- [X] T028 [P] Public barrel `src/vault/index.ts`: re-export the interfaces (`VaultReader`, `VaultWriter`, `VaultFs`, `VaultWriteLog`), the result/error types (`WriteResult`, `Fingerprint`, parse/path failures), and `createVault` — **not** the node adapter (test-only) (per contracts/vault-interface.md)
- [X] T029 [P] Update `CLAUDE.md` "Current focus" to reflect that the `src/vault/` spine has landed (Phase 1 keystone complete)
- [X] T030 Run lint + typecheck + the full test suite — confinement rule verified to bite, `tsc --noEmit` clean (incl. the not-unit-tested Tauri adapter + bootstrap), 38 files / 99 tests green against real `node:fs`/`node:sqlite` (SC-007)
- [ ] T031 [P] **Runtime check (user, GUI)**: `npm run tauri dev`, then from a configured vault path — write a note (appears in Obsidian as clean Markdown), edit it in Obsidian and confirm the next app write is refused as a conflict, confirm nothing outside the vault or under `.obsidian/` is touched, and verify zero network activity (quickstart.md runtime check — deferred to the user)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**.
- **US1 (Phase 3)**: depends on Foundational. The MVP.
- **US2 (Phase 4)**: depends on Foundational; its writer/reader tasks extend US1's `writer.ts`/`reader.ts`, so US1 must land first. Independently testable once done.
- **US3 (Phase 5)**: depends on Foundational (`paths.ts`) and on US1's reader/writer existing for the end-to-end test. Independently testable.
- **Polish (Phase 6)**: depends on all desired stories; `createVault` (T022) must exist before the index barrel (T028) re-exports it.

### Key Cross-Task Dependencies

- T010, T011 → T005 (`VaultFs`).
- T013 (reader) → T005, T007, T012, T006. T014 (writer) → T005, T007, T008, T009, T012.
- T019 → T018. T020 → T014. T021 → T013. T022 → T011, T013, T020, T019.
- T028 → T022. T030 runs after all implementation + tests.

### Same-File Notes (do NOT run these in parallel with each other)

- `src/vault/writer.ts`: T014 (US1 happy path) → T020 (US2 conflict machine).
- `src/vault/reader.ts`: T013 (US1) → T021 (US2 drift).
- `package.json`: T001 and T002 both edit it — order them.

---

## Parallel Opportunities

- **Setup**: T001 ‖ T002 ‖ T004 (different files); T003 after T002.
- **Foundational**: T005 ‖ T006 ‖ T007 ‖ T008 ‖ T009 (five independent files); then T010 ‖ T011.
- **US1**: T012 first; tests T015 ‖ T016 ‖ T017 after impl.
- **US2**: T018 ‖ (waits) ; tests T023 ‖ T024 ‖ T025 after impl.
- **US3**: T026 ‖ T027.
- **Polish**: T028 ‖ T029 ‖ T031; T030 after.

### Parallel Example: Foundational primitives

```bash
# Five pure/interface files, no interdependencies — build together:
Task: "VaultFs seam + low-level types in src/vault/fs.ts"
Task: "Result/error shapes in src/vault/errors.ts"
Task: "Pure path validator resolveVaultPath in src/vault/paths.ts"
Task: "computeFingerprint (mtime + SHA-256) in src/vault/fingerprint.ts"
Task: "VaultWriteLog interface in src/vault/writeLog.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL — blocks everything).
2. Phase 3 US1: frontmatter + reader + writer (fresh-write) + the three round-trip/atomic/malformed tests.
3. **STOP and VALIDATE**: a safe write→read round-trip works against a temp vault. This is the irreducible vault integration.

### Incremental Delivery

1. Setup + Foundational → seam ready.
2. + US1 → round-trip MVP (tested independently).
3. + US2 → never-clobber + composition root (tested independently) — the highest-risk guarantee (§13) now in place.
4. + US3 → verified path boundary (tested independently).
5. Polish → public barrel + full green suite.

### Notes

- Tests run against the real `node:fs` filesystem via `NodeVaultFs` in temp dirs; the `vault_writes` repo test uses an in-memory `node:sqlite` executor (`// @vitest-environment node`), matching Features 003/004.
- The Tauri adapter (T011) and the GUI runtime check (T031) are the only non-unit-tested surfaces — exercised by the user's `tauri dev`, consistent with 003/004.
- Commit cadence and all git operations remain the user's.
