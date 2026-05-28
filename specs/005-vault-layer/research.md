# Research: Vault Layer (VaultReader / VaultWriter)

**Feature**: 005-vault-layer · **Date**: 2026-05-27

All decisions resolve the Technical Context. No `NEEDS CLARIFICATION` remain.

---

## R1 — `tauri-plugin-fs` wiring + capability + runtime scope for a dynamic `vaultPath`

**Decision**: Add `tauri-plugin-fs` (Rust: `cargo add tauri-plugin-fs`; `.plugin(tauri_plugin_fs::Builder::default().build())` in `src-tauri/src/lib.rs`; JS: `@tauri-apps/plugin-fs`). The capability grants the fs **commands** needed (read text file, write text file, rename, stat/lstat, exists, read dir, mkdir). Because the vault folder is **user-chosen at runtime**, the allowed **path scope** is not a static capability entry — it is granted at runtime via the fs plugin's scope API (`allow_directory(vaultPath, recursive)`) when the vault is configured. The Tauri adapter therefore only works once a `vaultPath` has been authorized.

**Rationale**: It's the constitution-locked native bridge for the vault. A static capability path can't express "wherever the user keeps their vault"; Tauri v2's runtime scope is the supported way to authorize a chosen directory (the same shape the dialog-plugin "open folder" flow uses). Tests never touch this — they use the `node:fs` adapter (R3) — so the runtime scope is exercised by the consuming feature's `tauri dev` run, not by the unit suite.

**Alternatives considered**: A broad static scope (e.g. `$HOME/**`) in the capability — rejected: over-broad, violates least-privilege for a "sacred vault." A raw Rust fs layer — rejected: more custom Rust, off the locked-plugin path.

---

## R2 — Frontmatter parse/serialize

**Decision**: Use **`gray-matter`** to split a note into `{ data, content }` and to re-serialize (`matter.stringify(body, data)`). The parsed `data` is then validated against a **caller-supplied zod schema** (the vault layer is generic; it does not know course/project shapes). YAML frontmatter inside `---` fences (Obsidian-standard, Properties-friendly).

**Rationale**: Frontmatter has real edge cases (nested maps, arrays, quoting, multiline) that a hand-rolled splitter gets wrong; gray-matter is the ubiquitous, MIT, battle-tested choice and uses `js-yaml` underneath. Body content round-trips byte-faithfully; frontmatter **values** round-trip (key order/quoting may normalize, which is fine — we validate values, not bytes). This keeps written notes clean and Obsidian-Properties-compatible.

**Alternatives considered**: `js-yaml` + manual fence handling — reimplements gray-matter for no gain. A bespoke parser — rejected (correctness risk on the sacred path). **Risk/mitigation**: round-trip fidelity is asserted by a test (write→read→re-validate); gray-matter is CJS but Vite/Vitest handle it via dep optimization.

---

## R3 — The `VaultFs` seam + `node:fs` test adapter (the testability keystone)

**Decision**: Define a thin `VaultFs` interface — `readTextFile`, `writeTextFile`, `rename`, `stat` (→ `{ mtimeMs }`), `exists`, `readDir`, `mkdir` — in `src/vault/fs.ts`. Production adapter `adapters/tauri.ts` wraps `@tauri-apps/plugin-fs` (the **only** importer). Test adapter `adapters/node.ts` wraps `node:fs/promises` against temp directories (imported by tests only). `VaultReader`/`VaultWriter`/the conflict logic all depend on `VaultFs`.

**Rationale**: `@tauri-apps/plugin-fs` can't run under Vitest; without a seam, FR-004 (atomicity), the conflict state machine (US2), and path-safety (US3) couldn't be tested. `node:fs` is the real filesystem with real atomic `rename`, real mtimes, and real directory semantics — so the tests exercise genuine behavior. Same interface-first/deep-module shape as the 003 `SqlExecutor` adapters (Constitution IV).

**Alternatives considered**: An in-memory fake fs — rejected: wouldn't prove real atomic-rename or mtime semantics, which are the crux of atomicity + conflict detection. e2e-only — rejected: slow, can't run per-PR.

---

## R4 — Atomic write strategy

**Decision**: Write to a **temp file in the same directory** as the target (e.g. `<name>.<rand>.cic-tmp`), then **rename** it over the target. Create missing intermediate folders (within the vault) first. On any failure, attempt to remove the temp file. Rename is atomic on the same filesystem, so a reader never observes a half-written note and no temp artifact survives a success.

**Rationale**: Constitution I forbids leaving a half-written/clobbered file. Temp-in-same-dir guarantees the rename is intra-filesystem (a temp in the OS temp dir could cross filesystems and make rename non-atomic / a copy). Both adapters expose `rename`. (`tauri-plugin-fs` and `node:fs` both implement it.)

**Alternatives considered**: Write-in-place — rejected (a crash mid-write corrupts the note). Temp in OS tempdir then move — rejected (cross-device rename isn't atomic).

---

## R5 — Conflict-detection state machine + fingerprint

**Decision**: A note's **fingerprint** = `{ mtime: ISO-8601 string, hash: sha256-hex of the file text }` (hash via `crypto.subtle.digest` — present in both Node and the webview). The **write** decision, given target `P`:

| On disk | Recorded in `vault_writes` | Current vs recorded | Action |
|---|---|---|---|
| absent | absent | — | **write** (fresh), then record |
| present | present | **match** | **write** (managed, unchanged), then record |
| present | present | **differ** | **conflict** — refuse, leave file untouched |
| present | absent | — | **conflict** (unmanaged — never clobber a file the app didn't write) |

`writeNote(path, content, { overwrite: true })` bypasses the check (post-resolution) but **still records** the new fingerprint afterwards. On **read**, a fingerprint mismatch is reported as informational metadata; the read returns current content regardless (FR-010).

**Rationale**: Directly implements PRD §13 "detect → never clobber." Hashing in addition to mtime catches edits that preserve mtime and avoids false positives from mtime-only churn. The unmanaged-file → conflict rule is the conservative reading of "sacred vault." Recording after every successful write keeps the fingerprint current for the next decision (and is the exact data the future diff dialog consumes).

**Alternatives considered**: mtime-only — rejected (too coarse; misses content-preserving-mtime edits and trips on touch). Hash-only — rejected (mtime is a cheap first-line signal and what the watcher will key on later). Auto-overwrite unmanaged files — rejected (clobber risk).

---

## R6 — Path safety (vault scoping)

**Decision**: A **pure** `paths.ts` validates every requested vault-relative path *before* any filesystem call: reject absolute paths, reject any `..` segment or otherwise-escaping path (normalize and confirm the resolved path stays within `vaultPath`), and reject anything under `.obsidian/`. All adapters receive only validated, `vaultPath`-relative paths and resolve them against `vaultPath`. Tolerant of Windows (`\`) and POSIX (`/`) separators.

**Rationale**: The security boundary (FR-011/012) must be enforced in one pure, exhaustively-testable place with no I/O — so the "rejects traversal/`.obsidian`/absolute" tests need no filesystem. Centralizing it means no adapter or caller can accidentally bypass it.

**Alternatives considered**: Validate inside each adapter — rejected (duplicated, easy to forget, untestable without fs). Rely on Tauri's scope alone — rejected (the node test adapter has no Tauri scope; the boundary must live in our code, and Tauri scope is defense-in-depth on top).

---

## R7 — `VaultWriteLog`: keep `src/vault` independent of `src/db`

**Decision**: Define a `VaultWriteLog` interface in `src/vault/writeLog.ts` — `record(path, fingerprint)` / `get(path)`. `VaultWriter` depends on it, not on `src/db`. The concrete implementation wraps the **additive 003 `vault_writes` repository** (`recordVaultWrite` / `getVaultWrite`) and is constructed at the vault composition root (`src/vault/bootstrap.ts`), which is the one place that imports both `src/db` and `src/vault`.

**Rationale**: Constitution IV — no leaky abstraction. The vault layer shouldn't know the conflict log lives in SQLite; a future store (or an in-memory log in tests) drops in without touching `VaultWriter`. Tests inject a trivial in-memory `VaultWriteLog`, so the writer's conflict logic is tested without the DB; a separate test covers the real repo round-trip.

**Alternatives considered**: `VaultWriter` calls the 003 repo directly — rejected (couples the vault spine to the db module; harder to test in isolation). A combined "vault sync service" owning both — premature; that orchestration belongs to the later sync feature.

---

## Open questions

None. The MOC body template + marker re-render, the 3-way diff dialog, the live file-watcher reconcile loop, the backlink index, course authoring, the Blueprint, and all AI are out of scope (spec) — this layer ships the safe read/write/frontmatter/conflict-detection primitives they build on. One carried runtime concern — `tauri-plugin-fs` dynamic scope (R1) — is exercised by a consuming feature's `tauri dev`, not the unit suite; the seam keeps the unit tests on `node:fs`.
