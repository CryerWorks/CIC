# Implementation Plan: Vault Layer (VaultReader / VaultWriter)

**Branch**: `005-vault-layer` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-vault-layer/spec.md`

## Summary

Establish the `src/vault/` spine — the single, safe path through which the app reads and writes the user's Obsidian vault (Constitution I). Behind thin interfaces (`VaultReader`, `VaultWriter`) sits a low-level `VaultFs` seam with two adapters: a production adapter (the only importer of `tauri-plugin-fs`) and a `node:fs` test adapter (temp dirs), mirroring the 003 `SqlExecutor` pattern so the whole layer is unit-testable without the Tauri runtime. The writer does **atomic** writes (temp→rename), serializes clean Markdown, and **never clobbers** external edits — before each write it compares the file's on-disk fingerprint (mtime + SHA-256) against the value last recorded in the 003 `vault_writes` table and refuses on drift. All I/O is `vaultPath`-scoped (traversal/`.obsidian/` rejected). Frontmatter is parsed/validated through a caller-supplied zod schema. No UI — verified by tests (like 003).

## Technical Context

**Language/Version**: TypeScript 5.x (strict) · Rust (one plugin-registration touch in `src-tauri/`).

**Primary Dependencies**: `tauri-plugin-fs` (Rust + JS — **new**) · `gray-matter` (frontmatter parse/serialize — **new**) · `zod` (frontmatter validation, present) · the 003 data layer (`SqlExecutor`, `vault_writes` table) · `node:fs` / `node:crypto` (test adapter + hashing) · Vitest.

**Storage**: The **Obsidian vault** (Markdown files on disk — this layer's subject) + the 003 SQLite `vault_writes` table for the conflict-detection fingerprint. No new SQLite tables.

**Testing**: Vitest against a real local filesystem via the `VaultFs` `node:fs` adapter in temp dirs — round-trip, atomic-write, malformed-frontmatter, conflict detection (drift refused / unchanged writes / unmanaged = conflict / override), path-scoping, and the `vault_writes` repo round-trip.

**Target Platform**: Windows 11 desktop (the 001 Tauri shell). `node:fs`/`node:path` are cross-platform; path handling must tolerate Windows separators.

**Project Type**: Desktop app — adds an internal `src/vault/` layer; no UI surface.

**Performance Goals**: Personal scale (hundreds–thousands of notes). Reads/writes are interactive-instant; hashing a note is sub-millisecond.

**Constraints**: Fully local, zero network (FR-014). Atomic writes (FR-004). Never clobber (FR-006/009 / Constitution I). `vaultPath`-scoped, `.obsidian/` untouched (FR-011/012). Only the vault layer touches `.md` (FR-015). Never crash on malformed frontmatter (FR-002).

**Scale/Scope**: `VaultFs` seam + 2 adapters · path-safety · frontmatter parse/serialize · fingerprint · `VaultReader` · `VaultWriter` (with the conflict state machine) · `VaultWriteLog` interface + 003 `vault_writes` repo · composition root · test set.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Status | Notes |
|---|---|---|---|
| **I. Vault is Canonical and Sacred** | This feature **is** the enforcement of it | ✅ PASS (embodies it) | A single `VaultWriter` is the only `.md` writer (FR-015); atomic temp→rename (FR-004); never destructively overwrite — detect drift via `vault_writes` mtime+hash and refuse (FR-006/009); reconcile-not-stomp posture (read drift informational, FR-010); clean human-readable Markdown (FR-003); only `vaultPath`, never `.obsidian/` (FR-011/012). The marker-delimited MOC re-render + the 3-way diff dialog are the *consumers* of this layer (later); this feature ships the safe primitives + the conflict-detection signal they require. |
| **II. AI is Vendor-Agnostic Tutor** | No AI | ✅ PASS (vacuous) | No provider, SDK, or network. |
| **III. Preserve Desirable Difficulty** | No learning mechanics | ✅ PASS | Pure file I/O; nothing smooths a learning loop. |
| **IV. Interface-First, Deep Modules** | This feature *is* the `src/vault/` spine | ✅ PASS | Thin interfaces (`VaultReader`/`VaultWriter`/`VaultFs`/`VaultWriteLog`); deep adapters (`adapters/tauri.ts` — the **only** `tauri-plugin-fs` importer; `adapters/node.ts` — test-only). `VaultWriteLog` keeps `src/vault` from importing `src/db` internals — the composition root wires the 003 repo behind it. fs plugin confined to `src/vault/adapters/**` by the existing `no-restricted-imports` rule (same mechanism as the SQL plugin). |
| **V. Spec-Driven Development** | Yes | ✅ PASS | Full Phase 1 doc set; user owns git; end-of-feature walkthrough; the data-integrity + safety surfaces (atomicity, conflict, path-scoping) tested — the constitution names vault read/write + conflict resolution as required test surfaces. |

**Technology constraints**: TS strict ✅, zod ✅, Vitest ✅, `tauri-plugin-fs` ✅ (the locked native bridge for the vault). Two **new dependencies** — `tauri-plugin-fs` (locked in the stack) and `gray-matter` (frontmatter; a small, ubiquitous YAML-frontmatter lib — not an AI SDK, no vendor-lock concern). **One Rust touch**: register the fs plugin + a capability; flagged per the constitution.

**Gate result: PASS.** No violations; Complexity Tracking omitted.

## Project Structure

### Documentation (this feature)

```text
specs/005-vault-layer/
├── spec.md
├── plan.md                      # This file
├── research.md                  # Phase 0 — fs wiring + scope, frontmatter lib, VaultFs seam, atomic write, conflict FSM, path-safety, VaultWriteLog
├── data-model.md                # Phase 1 — VaultNote / Fingerprint / WriteResult / ReadResult shapes; the vault_writes repo (no schema change)
├── quickstart.md                # Phase 1 — run the tests; how the layer is wired; out of scope
├── contracts/
│   ├── vault-interface.md       # the src/vault public surface: VaultFs, VaultReader, VaultWriter, VaultWriteLog, result types, path contract
│   └── vault-writes-repo.md     # additive 003 repo: recordVaultWrite / getVaultWrite
└── checklists/requirements.md   # Spec quality checklist (green)
```

### Source Code (repository root)

```text
src/
├── vault/                        # the knowledge-persistence spine (new)
│   ├── fs.ts                     # VaultFs INTERFACE (the seam) + low-level types (stat, dirent)
│   ├── adapters/
│   │   ├── tauri.ts              # prod adapter — ONLY import of @tauri-apps/plugin-fs
│   │   └── node.ts               # test adapter — node:fs (imported by tests only)
│   ├── paths.ts                  # pure vault-relative path validation (traversal / .obsidian / absolute → reject)
│   ├── fingerprint.ts            # mtime + SHA-256 content hash (crypto.subtle)
│   ├── frontmatter.ts            # parse/serialize via gray-matter; validate against a caller zod schema
│   ├── writeLog.ts               # VaultWriteLog interface (record / get the fingerprint)
│   ├── reader.ts                 # VaultReader: read / readAs(schema) / list / exists
│   ├── writer.ts                 # VaultWriter: atomic write + conflict state machine (never clobber)
│   ├── errors.ts                 # typed results: WriteResult (written | conflict), parse/path failures
│   ├── bootstrap.ts              # composition root: Tauri VaultFs + VaultWriteLog(over 003) → reader/writer
│   └── index.ts                  # the spine's public surface
├── db/
│   └── repositories/vaultWrites.ts   # + recordVaultWrite / getVaultWrite (additive; exported from src/db/index.ts)
src-tauri/
├── Cargo.toml                    # + tauri-plugin-fs
├── src/lib.rs                    # + .plugin(tauri_plugin_fs::Builder::default()…)
└── capabilities/default.json     # + fs permissions (read/write/rename/stat/exists/readdir/mkdir)
```

**Structure Decision**: `src/vault/` is the Pocock spine the constitution names alongside `src/db` and `src/ai`. The **`VaultFs` interface is the seam** (the same shape of decision as `SqlExecutor`): the Tauri-fs adapter is the production deep module (and sole `tauri-plugin-fs` importer, enforced by ESLint); the `node:fs` adapter is test-only — which is exactly what makes the atomicity/conflict/path behaviors unit-testable against a real filesystem in Vitest. `VaultWriter` depends on `VaultFs` + a `VaultWriteLog` (not on `src/db` directly); the composition root implements `VaultWriteLog` over the additive 003 `vault_writes` repo. Path validation lives in a pure `paths.ts` (no I/O) so the security boundary is trivially testable.

## Phase 0 — Research

See [research.md](research.md). Resolves: `tauri-plugin-fs` wiring + capability + **runtime scope grant for the dynamic `vaultPath`** (R1); the frontmatter library — **gray-matter** for parse/serialize (R2); the **`VaultFs` seam + `node:fs` test adapter** testability keystone (R3); the **atomic-write** strategy — temp-in-same-dir → rename (R4); the **conflict-detection state machine** + fingerprint (mtime + SHA-256) (R5); **path-safety** validation (traversal/`.obsidian/`/absolute) as a pure function (R6); the **`VaultWriteLog`** seam keeping `src/vault` independent of `src/db` internals (R7). No unresolved `NEEDS CLARIFICATION`.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the layer's value shapes (`VaultNote`, `Fingerprint`, `WriteResult` = `written | conflict`, `ReadResult`), frontmatter validation flow, and the additive `vault_writes` repository (no schema change — the table shipped in 003).
- [contracts/vault-interface.md](contracts/vault-interface.md) — the `src/vault` public surface features depend on: `VaultFs`, `VaultReader`, `VaultWriter`, `VaultWriteLog`, the result/error types, and the path-safety contract.
- [contracts/vault-writes-repo.md](contracts/vault-writes-repo.md) — `recordVaultWrite` / `getVaultWrite` on the 003 store.
- [quickstart.md](quickstart.md) — run the test suite (the acceptance surface); how the layer is wired at the composition root; what's deliberately deferred.

## Complexity Tracking

No constitution violations — section intentionally empty.
