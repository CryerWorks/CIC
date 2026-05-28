# Implementation Plan: Vault Configuration (choose & persist the Obsidian vault)

**Branch**: `006-vault-config` | **Date**: 2026-05-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-vault-config/spec.md`

## Summary

The user-facing gate that points CIC at an Obsidian vault and makes the Feature 005 layer reachable. The user picks a folder (OS-native chooser), the app **authorizes fs access to only that folder** (runtime scope grant), **persists the path** as local app state in SQLite, and **confirms reachability** by reading the vault (a Markdown-note count — never a probe write). A `VaultProvider` (mirroring the existing `DbProvider`) holds the single authoritative active-vault handle (the 005 `reader`/`writer` from `createVault`) and a discriminated state — `unset · checking · ready · unavailable` — that a Vault screen renders (first-run onboarding, status, change, and graceful recovery from a stored path that's gone). No vault writes, no notes UI; the observable outcome is "vault connected, N notes found."

## Technical Context

**Language/Version**: TypeScript 5.x (strict) · Rust (one **custom** command in `src-tauri/` for the runtime fs-scope grant — flagged).

**Primary Dependencies**: `@tauri-apps/plugin-dialog` + `tauri-plugin-dialog` (**new** — native folder chooser) · `@tauri-apps/api` `invoke` (call the scope-grant command) · the Feature 005 vault layer (`createVault`, `VaultReader`) · the Feature 003 data layer (`SqlExecutor`, migration runner) · React 19 + React Router v7 + Tailwind v4 (present) · Vitest + Testing Library (present).

**Storage**: SQLite (003) — a **new `settings` key-value table** (migration `m0002`) holds the configured vault path as app state. The vault folder itself is the 005 concern; this feature only records *which* folder.

**Testing**: Vitest. Settings repo round-trip + the `m0002` migration against `node:sqlite` (`// @vitest-environment node`). `VaultProvider` state machine + the Vault screen via Testing Library (jsdom) with injected seams — a stub folder-picker, a stub/`node:fs`-backed connector, and a real `NodeSqlExecutor` for persistence — so first-run, persistence, recovery, and change flows are tested without the Tauri runtime (same approach as Features 003/004).

**Target Platform**: Windows 11 desktop (the 001 Tauri shell).

**Project Type**: Desktop app — adds a `settings` table + repo (`src/db`), a production vault *connector* + folder-picker adapter and a `VaultProvider` + Vault screen (`src/app`), and one custom Rust command (`src-tauri`). No change to the 005 vault layer.

**Performance Goals**: Personal scale. Picking + connecting + counting notes is interactive-instant for hundreds–thousands of notes; the connect step shows an in-progress state for very large vaults.

**Constraints**: Fully local, zero network (FR-013). **Least-privilege fs scope** — authorize only the chosen folder, never broader (FR-004). **No probe writes** into the vault — confirmation is read-only (Constitution I). Graceful recovery from a missing/inaccessible stored path; never crash, never touch another location (FR-007). Single authoritative active vault (FR-010). TS strict; zod for any external/stored shape; never crash on a bad/missing path.

**Scale/Scope**: 1 new table + migration · 1 settings repo · 1 Rust command + dialog plugin wiring · 1 production connector + picker adapter · 1 `VaultProvider` · 1 Vault route (+ a sidebar/onboarding affordance) · the test set.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Status | Notes |
|---|---|---|---|
| **I. Vault is Canonical and Sacred** | Yes — this feature *opens* the door to the vault | ✅ PASS | **Read-only confirmation** (note count via `VaultReader.list`), never a probe write — honors "never destructively touch the vault." Least-privilege scope: authorize **only** the chosen folder (FR-004), not `$HOME/**`. `.obsidian/` is never read/written (the 005 layer already excludes it). All `.md` access still flows through the single 005 `VaultWriter`/`VaultReader` — this feature adds **no** new file I/O, it only supplies the `vaultPath` and the access grant. |
| **II. AI is Vendor-Agnostic Tutor** | No AI | ✅ PASS (vacuous) | No provider/SDK/network. |
| **III. Preserve Desirable Difficulty** | No learning mechanics | ✅ PASS | Pure configuration; nothing smooths a learning loop. |
| **IV. Interface-First, Deep Modules** | Yes | ✅ PASS | `VaultProvider` mirrors `DbProvider` (the UI composition root). Deep details sit behind seams: a `FolderPicker` (`() => Promise<string \| null>`), a `VaultConnector` (`(path) => Promise<ConnectResult>`), and the settings repo behind `src/db`. The production connector composes the 005 `createVault` + the scope-grant command; tests inject fakes. No feature imports the dialog plugin or `invoke` directly. |
| **V. Spec-Driven Development** | Yes | ✅ PASS | Full Phase-1 doc set; user owns git; end-of-feature walkthrough; the data-integrity + safety surfaces (persistence, least-privilege scope, recovery) tested. |

**Technology constraints**: TS strict ✅, zod ✅, Vitest ✅. **Two flagged native touches** (per the Constitution's "drop to native only when necessary, and flag it"):
1. **`tauri-plugin-dialog`** — a *new native bridge* not in the Constitution's locked list (`sql`/`fs`/`notification`). Justified: choosing a folder needs the OS-native chooser; there is no reliable web API for a directory *path* in the Tauri webview. It is a standard, sanctioned Tauri plugin (the "use a plugin" path, not custom Rust). **Recommend the user acknowledge it as an added locked bridge** (a one-line PRD/Constitution note).
2. **A custom Rust command** (`grant_vault_access(path)` → `app.fs_scope().allow_directory(path, true)`) — *genuinely custom native code*, flagged. Necessary because Tauri v2 exposes **no stable JS API** to extend the fs scope to a runtime-chosen directory (anticipated by Feature 005 research R1). Kept to the minimum: one command, no business logic in Rust.

**Gate result: PASS** — no violations; the two native touches are necessary and flagged (the dialog plugin is the standard plugin path; the scope command is the minimal custom Rust). Complexity Tracking holds the justifications.

## Project Structure

### Documentation (this feature)

```text
specs/006-vault-config/
├── spec.md
├── plan.md                      # This file
├── research.md                  # Phase 0 — picker, runtime fs-scope grant, settings/migration, VaultProvider seams, recovery, onboarding placement
├── data-model.md                # Phase 1 — settings table (m0002) + VaultConfig/VaultState value shapes
├── quickstart.md                # Phase 1 — run the tests; the runtime check; out of scope
├── contracts/
│   ├── vault-provider.md        # VaultState/actions; FolderPicker + VaultConnector seams; useVault/useVaultState
│   ├── settings-repo.md         # getSetting / setSetting over the 003 store
│   └── native-scope-command.md  # the grant_vault_access Rust command + JS authorizeVaultPath wrapper
└── checklists/requirements.md   # Spec quality checklist (green)
```

### Source Code (repository root)

```text
src/
├── db/
│   ├── migrations/
│   │   ├── m0002_settings.ts        # NEW — key-value settings table (forward-only)
│   │   └── index.ts                 # + register m0002 (append-only)
│   ├── repositories/settings.ts     # NEW — getSetting / setSetting (generic kv), exported from src/db/index.ts
│   └── models/setting.ts            # NEW — SettingSchema (zod) { key, value }
├── app/
│   ├── providers/
│   │   ├── VaultProvider.tsx        # NEW — active-vault composition root: state machine + actions + seams; useVault()/useVaultState()
│   │   └── vault/
│   │       ├── connect.ts           # NEW (prod) — VaultConnector: authorizeVaultPath + createVault + probe note count
│   │       ├── picker.ts            # NEW (prod) — FolderPicker over @tauri-apps/plugin-dialog (sole importer)
│   │       └── keys.ts              # NEW — VAULT_PATH_KEY constant
│   ├── routes/vault/
│   │   └── VaultRoute.tsx           # NEW — onboarding empty-state · status (path + note count) · choose/change · recovery
│   ├── routes/DashboardRoute.tsx    # + first-run banner ("no vault connected → choose") when unset
│   ├── routes/                      # (other existing routes unchanged)
│   ├── navigation.ts                # + a "Vault" destination
│   ├── router.tsx                   # + the /vault route
│   └── main.tsx                     # wrap routes in <VaultProvider> (under the ready DbProvider)
src-tauri/
├── Cargo.toml                       # + tauri-plugin-dialog
├── src/lib.rs                       # + .plugin(dialog) + the grant_vault_access command + .invoke_handler
└── capabilities/default.json        # + dialog permission
```

**Structure Decision**: Persistence is ordinary app state → a generic `settings` key-value table in `src/db` (migration `m0002` — the first evolution past `m0001`, exercising the tested forward-only runner), behind a small repo on the `SqlExecutor` seam. The vault layer (005) is **not modified**: the production *connector* in the app layer composes its `createVault` with the runtime scope grant. `VaultProvider` is the UI composition root (mirrors `DbProvider`) and the single source of "which vault is active" (FR-010); the deep, Tauri-specific pieces (folder chooser, scope-grant `invoke`) live behind the `FolderPicker` / `VaultConnector` seams so the provider's state machine is fully unit-testable without Tauri (Constitution IV). The Vault screen is a normal route, not a global app gate — non-knowledge screens (Dashboard, Domains) keep working without a vault; later knowledge features gate themselves on `useVault()`.

## Phase 0 — Research

See [research.md](research.md). Resolves: the **folder picker** (`tauri-plugin-dialog`, `open({ directory: true })`) (R1); the **runtime fs-scope grant** for a user-chosen directory — the custom Rust command + boot-time re-grant, and why no JS API suffices (R2, the key risk); **persistence** — the `settings` key-value table + `m0002` migration vs a Tauri store file (R3); the **`VaultProvider` state machine + seams** (`FolderPicker`/`VaultConnector`) for Tauri-free testability (R4); **recovery + validation** of a stored path that's missing/inaccessible (R5); **onboarding placement** — a Vault route + an unset affordance, not a global gate (R6). No unresolved `NEEDS CLARIFICATION`.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the `settings` table (`m0002`, no change to `m0001`), `SettingSchema`, and the `VaultConfig` / `VaultState` value shapes + state transitions.
- [contracts/vault-provider.md](contracts/vault-provider.md) — `VaultState`, the provider actions (`chooseVault`/`changeVault`/`retry`), the `FolderPicker` + `VaultConnector` seams, `useVault()` / `useVaultState()`.
- [contracts/settings-repo.md](contracts/settings-repo.md) — `getSetting` / `setSetting`.
- [contracts/native-scope-command.md](contracts/native-scope-command.md) — the `grant_vault_access` Rust command + the `authorizeVaultPath` JS wrapper.
- [quickstart.md](quickstart.md) — run the suite (the acceptance surface), the GUI runtime check (now genuinely runnable), and what's deferred.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Custom Rust command (`grant_vault_access`) | Tauri v2 has no stable JS API to extend the fs scope to a runtime-chosen directory; least-privilege requires not pre-allowing a broad path | A broad static capability scope (`$HOME/**`) — rejected in 005 R1: over-broad for a "sacred vault." `tauri-plugin-persisted-scope` — still needs a runtime grant to persist; re-granting on boot is simpler and adds no plugin. |
| New native bridge (`tauri-plugin-dialog`) | A native folder chooser is the only way to obtain a directory *path*; no web API provides one in the webview | Hand-rolled path entry (typo-prone, bad UX) or a Rust-side dialog (more custom Rust than a sanctioned plugin). |
| New `settings` table beyond strict PRD §8 | Need to persist the chosen vault path as app state; a generic kv table serves this and future small settings | A dedicated single-row `vault_config` table — rejected: less reusable; a Tauri store file — rejected: splits app state out of the one local store the spec commits to. |
