# Quickstart: Vault Configuration

**Feature**: 006-vault-config · **Date**: 2026-05-28

Goal: a user can point CIC at their Obsidian vault, the app authorizes only that folder, remembers it, confirms it's reachable (note count), recovers gracefully if it goes missing, and the rest of the app can obtain the active vault handle. Unlike 005, this feature **is** GUI-runnable — and it makes the long-deferred 005 read path observable in the running app.

## Prerequisites

Features 001/003/004/005 in place. New deps: `tauri-plugin-dialog` (Rust + JS). The first `tauri dev` after this feature recompiles the shell (new Rust dep + the `grant_vault_access` command).

## Verify the feature (tests — the unit acceptance surface)

```powershell
npm run test
```

| Check | Backs |
|---|---|
| `m0002` applies on `m0001` → `settings` table exists | settings-repo.md |
| `setSetting`/`getSetting` round-trip; re-set updates in place; unset key → `null` | settings-repo.md |
| Boot with no stored path → `VaultState` `unset` | FR-005 / SC-001 |
| Choose a folder (stub picker) that connects → `ready` with note count; `vault.path` persisted | FR-001/002/012 / SC-001/007 |
| Cancel the picker → config unchanged | FR-008 / US1 |
| Boot with a stored, reachable path → `ready` without re-choosing | FR-003 / SC-002 |
| Boot with a stored, missing/denied path → `unavailable` + recovery prompt, no crash, no other access | FR-007 / SC-004 |
| Change the vault → new folder active + persisted; re-choosing the same folder is idempotent | FR-006 / US3 |
| Vault screen renders onboarding (unset), status (ready: path + count), recovery (unavailable) | US1/US2/US3 |

Provider/screen tests run in jsdom with a real `NodeSqlExecutor`, a **stub `FolderPicker`**, and a **stub/`node:fs`-backed `VaultConnector`** — Tauri-free (same approach as 003/004). The migration + settings-repo tests use `node:sqlite` (`// @vitest-environment node`).

## How it's wired

```
main.tsx: <DbProvider> → (ready) <VaultProvider> → <HashRouter> → routes
VaultProvider: reads vault.path (settings) → connect(path) → VaultState
  connect (prod): authorizeVaultPath(path) [Rust grant] → createVault({ vaultPath, db }) → reader.list().length
Vault screen (/vault): useVaultState() → onboarding | status | recovery; actions chooseVault/changeVault/retry
later knowledge features: useVault() → the 005 { reader, writer }
```

## Runtime check (needs the GUI — user)

`npm run tauri dev`, then:
1. First run → the Vault screen invites you to choose a folder. Pick your Obsidian vault → it reports the path and the number of Markdown notes found.
2. Restart the app → the vault is still connected, no re-pick.
3. Rename/move the folder, restart → a clear "vault unavailable" prompt with re-choose; the app does not crash and touches nothing else.
4. Change the vault to another folder → updates + persists.
5. Confirm zero network activity throughout, and that nothing under `.obsidian/` (or outside the chosen folder) is accessed.

*(This is also the moment the 005 vault layer first runs for real — though only its read path; writing notes arrives with the first knowledge feature.)*

## Out of scope (so you don't look for it)

No notes browsing/opening/creating/editing, no 3-way diff dialog, no live watcher/backlink index, no multiple vaults, no migration of tracking data on vault change, no AI. This feature connects the vault and proves it's readable; knowledge features build on `useVault()`.
