# Implementation Plan: Source File Import & Local Storage

**Branch**: `011-source-file-import` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-source-file-import/spec.md`

## Summary

Let a learner attach a real source file to a file-based Resource by picking it with the OS file chooser; the app copies ("internalizes") the file into a per-machine, app-managed store **outside** the Obsidian vault and records its path on the Resource so citation deep-links can open it (the action currently grayed out because file-kind Resources have no file). Deleting a Resource reclaims its stored copy. A Resource also gains an optional **home Domain** so the registry can be filed/filtered by Domain.

**Technical approach**: a single custom Tauri (Rust) command performs the copy/cleanup with full native fs access (no broad JS fs capability, no path-traversal surface); the native dialog + `invoke` calls sit behind a `SourceFiles` seam (mirroring the existing `FolderPicker`/`VaultConnector` DI) so the React hook/components stay unit-testable without Tauri. The internalized path reuses the existing `resources.file_path` column (it already drives the citation opener); the only schema change is an additive nullable `resources.domain_id` (migration `m0005`). No new npm dependencies.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`) on React 19 + Vite; Rust (Tauri 2 shell) for one custom command.

**Primary Dependencies**: Tauri 2 (`@tauri-apps/plugin-dialog` — already wired for the vault picker; `@tauri-apps/plugin-opener` — already used by citations; `@tauri-apps/api` `invoke`), `tauri-plugin-sql`, `zod`. **No new dependencies.**

**Storage**: SQLite (`resources` table gains nullable `domain_id`) + a new app-managed **filesystem store** for copied source files, rooted at the OS app-local-data directory (`appLocalData/resources/<resourceId>/<filename>`), never inside the vault.

**Testing**: Vitest — `node:sqlite` adapter for the migration + repo (`resources.domain_id`); jsdom + injected `SourceFiles` fake for the hook/components. The native copy/remove + the OS dialog cannot run under Vitest → covered by the live `tauri dev` quickstart.

**Target Platform**: Desktop (Tauri; Windows primary, macOS/Linux compatible).

**Project Type**: Desktop app (single project; `src/` frontend + `src-tauri/` shell).

**Performance Goals**: attach a typical document in <30 s (SC-001); the UI stays responsive with a "copying…" state during the native copy (FR-013).

**Constraints**: fully local, no network (FR-010); store strictly outside the vault (FR-004, SC-005); copy-never-move (FR-003, SC-006); imports are all-or-nothing — never a half-stored file (FR-011, SC-002); the native command must constrain its destination to the app store (no path traversal from `resourceId`/`filename`).

**Scale/Scope**: single-user, single-machine. Tens–hundreds of Resources; individual files up to large media (no hard cap, v1).

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Vault Sacred** (NON-NEGOTIABLE) | ✅ The store lives in `appLocalData`, **never** in `vaultPath`; no `.md` writes; `VaultReader`/`VaultWriter` untouched. The Rust command writes only to a fixed app-store base, so it cannot target the vault. SC-005 asserts no binaries land in the vault. |
| **II. AI Vendor-Agnostic** (NON-NEGOTIABLE) | ✅ N/A — no AI in this feature. It is the *local storage foundation* a future Phase-3 RAG feature will read from; RAG/embeddings are explicitly out of scope. |
| **III. Desirable Difficulty** (NON-NEGOTIABLE) | ✅ N/A — no learning-mechanic change. Opening a cited source does not smooth retrieval, spacing, or calibration. |
| **IV. Interface-First, Deep Modules** | ✅ Tauri specifics (dialog pick, `invoke` copy/remove) sit behind a thin `SourceFiles` seam; the hook/components depend on the seam, not on `invoke`/dialog. The custom Rust command is the deep impl, wired at the composition root. ⚠️ **Flagged native code** (the Rust command) — justified in Complexity Tracking. |
| **V. Spec-Driven Development** | ✅ Spec authored; this plan + full Phase-1 doc set follow. ⚠️ **PRD reconciliation required**: this adds `resources.domain_id` and an internalized-file storage location, extending PRD §8 / refining F10.8 — flagged for a PRD update at implementation (per "update the PRD first"). |

**Result**: PASS. One flagged native-code item (justified below); one PRD reconciliation to perform during implementation.

## Project Structure

### Documentation (this feature)

```text
specs/011-source-file-import/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (R1–R11)
├── data-model.md        # Phase 1 — resources.domain_id + the app file store layout
├── quickstart.md        # Phase 1 — live tauri dev scenarios A–H
├── contracts/
│   ├── source-files.md  # the SourceFiles TS seam + the Rust command contract
│   ├── resource-data.md # resources.domain_id schema + repo fn signatures
│   └── ui-resources.md  # ResourceForm/registry UI contract (Browse, attached-file, domain, open)
└── checklists/
    └── requirements.md  # (from /speckit-specify) — all pass
```

### Source Code (repository root)

```text
src-tauri/src/lib.rs                         # + import_resource_file, remove_resource_files commands; register in invoke_handler
src-tauri/capabilities/default.json          # (no change — dialog:allow-open + opener:default already granted)

src/db/migrations/
├── m0005_resource_domain.ts                 # NEW — additive: resources.domain_id (nullable) + index
└── index.ts                                 # register m0005

src/db/models/resource.ts                    # + domain_id: string | null
src/db/repositories/resources.ts             # registerResource/updateResource accept domainId; listResources gains optional domain filter

src/features/resources/
├── sourceFiles.ts                           # NEW — SourceFiles seam (pickFile + importFile + removeFiles) + Tauri-backed default
├── useResources.ts                          # wire import on file-pick; cleanup on delete; domain assign/filter
├── ResourceForm.tsx                          # Browse button (native picker) + attached-file state + Domain dropdown
└── ResourcesRoute.tsx                        # registry Domain filter; pass SourceFiles + domains through

src/app/                                     # composition root: provide the Tauri SourceFiles impl (mirrors connector/picker wiring)
src/features/srs/citations/openTarget.ts     # (unchanged — already opens from resources.file_path; now that path exists)

# Tests
src/db/migrate.*.test.ts                     # bump latest version 4 → 5; scope the 010 self-heal test to <= 4
src/db/repositories/resources.test.ts        # + domain_id register/update/filter
src/features/resources/ResourcesRoute.test.tsx  # inject a fake SourceFiles; cover Browse→attach, delete cleanup, domain filter
```

**Structure Decision**: Single desktop project, extending the existing Feature-010 Resources surface (`src/features/resources/`, `src/db/repositories/resources.ts`). The one new architectural element is the `SourceFiles` seam + its Tauri-backed deep impl (Rust command), wired at the app composition root — consistent with the existing `FolderPicker`/`VaultConnector` DI.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Custom Rust command** (`import_resource_file` / `remove_resource_files`) — Constitution Tech-Constraint "only drop to Rust for genuinely custom native code, and flag it" | Copying a user-picked file from an **arbitrary** source path into the app store needs full fs access. A Rust command has it natively, performs the copy in one call (no file bytes through JS), and constrains the destination to the app store. | The `tauri-plugin-fs` route was rejected: reading an arbitrary picked path requires granting broad, insecure JS fs read scope (`$HOME/**` or wider), and `fs:allow-copy-file` isn't enabled. The Rust command needs **no** new capability and removes the path-traversal surface by fixing the destination base. Mirrors the existing `grant_vault_access` command. |
