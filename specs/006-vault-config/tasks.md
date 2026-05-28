---
description: "Task list for Feature 006 — Vault Configuration (choose & persist the Obsidian vault)"
---

# Tasks: Vault Configuration (choose & persist the Obsidian vault)

**Input**: Design documents from `specs/006-vault-config/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (vault-provider · settings-repo · native-scope-command), quickstart.md

**Tests**: INCLUDED. The constitution names data-integrity + safety surfaces (persistence, least-privilege scope, recovery) as required test surfaces, and the spec's success criteria are test-shaped. Test tasks are first-class.

**Organization**: Grouped by user story — US1 first-run choose / US2 persistence + recovery / US3 change — each an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)
- Every task names an exact file path.

## Path Conventions

Single project; React app under `src/app`, data layer under `src/db`, the 005 vault layer under `src/vault` (reused, **not** modified), native shell under `src-tauri`. Tests live beside the code (`*.test.ts[x]`), matching Features 003–005.

---

## Phase 1: Setup (native bridge + the flagged Rust touch)

**Purpose**: Bring in the folder-picker plugin and stand up the runtime fs-scope grant before any app code uses them.

- [X] T001 [P] Add `@tauri-apps/plugin-dialog` to `package.json` and `tauri-plugin-dialog` to `src-tauri/Cargo.toml`
- [X] T002 In `src-tauri/src/lib.rs`: register the dialog plugin (`.plugin(tauri_plugin_dialog::init())`) and add the **flagged custom command** `grant_vault_access(app, path)` → `app.fs_scope().allow_directory(&path, true)` (via `tauri_plugin_fs::FsExt`), wired with `.invoke_handler(tauri::generate_handler![grant_vault_access])` — per contracts/native-scope-command.md (depends on T001)
- [X] T003 [P] Add `dialog:allow-open` to the permissions in `src-tauri/capabilities/default.json` (the fs commands + the runtime path scope are already handled by Feature 005 + T002)

**Checkpoint**: the picker plugin and the scope-grant command exist for the connector to use.

---

## Phase 2: Foundational (settings persistence + the provider's boot/read state machine)

**Purpose**: The shared infrastructure every story builds on — the settings table/repo, the seams, and the `VaultProvider` skeleton with its boot-time read state machine. No story-specific *write* actions yet.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T004 [P] `SettingSchema` (zod `{ key, value }`) in `src/db/models/setting.ts`; export it from `src/db/models/index.ts`
- [X] T005 [P] Migration `m0002_settings` (`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`) in `src/db/migrations/m0002_settings.ts` (forward-only)
- [X] T006 Append `m0002Settings` to the registry in `src/db/migrations/index.ts` (never reorder/edit a shipped migration) (depends on T005)
- [X] T007 `getSetting(db, key)` / `setSetting(db, key, value)` (upsert on `key`) in `src/db/repositories/settings.ts`; re-export from `src/db/index.ts` (depends on T004, T006)
- [X] T008 [P] Settings + migration tests in `src/db/repositories/settings.test.ts` (`// @vitest-environment node`, in-memory `node:sqlite`): `migrate()` applies `m0001`+`m0002` and the `settings` table is usable; `setSetting`→`getSetting` round-trips; re-setting a key updates in place (no duplicate); `getSetting` of an unset key → `null` (depends on T007)
- [X] T009 [P] `VAULT_PATH_KEY = "vault.path"` constant in `src/app/providers/vault/keys.ts`
- [X] T010 [P] Production `FolderPicker` in `src/app/providers/vault/picker.ts` — `open({ directory: true, multiple: false, title })` from `@tauri-apps/plugin-dialog`, returning the chosen path or `null`; the **sole importer** of the dialog plugin
- [X] T011 Production `VaultConnector` + `authorizeVaultPath` in `src/app/providers/vault/connect.ts`: `createConnector(db)` → `(path) => { await authorizeVaultPath(path) [invoke grant_vault_access]; const vault = createVault({ vaultPath: path, db }); return { ok, vault, noteCount: (await vault.reader.list()).length } }`, catching failures into `{ ok:false, error }` (read-only probe — no write) (depends on T002, reuses 005 `createVault`)
- [X] T012 `VaultProvider` scaffold + **boot/read state machine** in `src/app/providers/VaultProvider.tsx`: the `VaultState` union (`checking · unset · ready · unavailable`), context, `useVaultState`/`useVault`/`useVaultActions`, injectable `picker`/`connect` props (prod defaults from T010/T011), and the mount effect — wait on `useDbState()` (stay `checking` until the store is ready), read `VAULT_PATH_KEY`; absent → `unset`; present → `connect(path)` → `ready { path, vault, noteCount }` | `unavailable { path, error }`. Actions are added per story. (depends on T007, T009, T010, T011)
- [X] T013 [P] Vault test-support in `src/app/providers/vault/test-support.tsx`: a `renderWithVault` wiring `DbProvider` (real `NodeSqlExecutor`) + `VaultProvider` with injectable **fake** `picker`/`connect`; a `fakeConnector(map)` helper (path → `ready(count)` | `unavailable(error)`); a `seedSetting(db, key, value)` helper (depends on T012)

**Checkpoint**: the store persists settings, the provider boots and resolves to `unset`/`ready`/`unavailable`, and tests can drive it Tauri-free.

---

## Phase 3: User Story 1 - Choose a vault on first run (Priority: P1) 🎯 MVP

**Goal**: From a clean install (no vault), the app shows a guided prompt; the user picks a folder; the app authorizes + connects it, persists the path, and confirms reachability with a note count.

**Independent Test**: Mount with no stored path (real `NodeSqlExecutor`, fake picker/connector) → state `unset`, screen shows onboarding. Invoke `chooseVault`; picker returns a path; connector succeeds → state `ready` with the note count and `vault.path` is persisted. Picker returns `null` (cancel) → unchanged. Connector fails → error surfaced, still `unset`, nothing persisted.

### Implementation for User Story 1

- [X] T014 [US1] Implement `chooseVault()` in `src/app/providers/VaultProvider.tsx`: call `picker`; `null` → no-op; path → `checking` → `connect(path)`; ok → `setSetting(VAULT_PATH_KEY, path)` then `ready`; fail → surface the error and **keep the prior state** (persist-only-on-success, R5) (depends on T012)
- [X] T015 [P] [US1] Register the section in `src/app/navigation.ts` (a `Vault` destination, `implemented: true`) and add the `/vault` route to `src/app/router.tsx`
- [X] T016 [P] [US1] Mount `<VaultProvider>` wrapping `<AppRoutes>` (under the existing `DbProvider`) in `src/main.tsx`
- [X] T017 [US1] `VaultRoute` in `src/app/routes/vault/VaultRoute.tsx`: `unset` → guided empty state with a "Choose your vault" button calling `chooseVault`; `checking` → in-progress; `ready` → the configured path + "N Markdown notes found" + (a "Change vault" affordance added in US3) (depends on T014)
- [X] T018 [P] [US1] First-run Dashboard banner in `src/app/routes/DashboardRoute.tsx`: when `useVaultState()` is `unset`, render a prominent callout above the existing content — "No vault connected — choose your vault" — linking to `/vault`; the banner disappears once a vault is set. This is the first-run entry point (the user lands on Dashboard). No global gate — other screens keep working without a vault.

### Tests for User Story 1

- [X] T019 [P] [US1] `VaultProvider` first-run tests in `src/app/providers/VaultProvider.test.tsx` (`renderWithVault`): no stored path → `unset`; `chooseVault` + picker path + connector ok → `ready` with the count and `getSetting(VAULT_PATH_KEY)` returns the path; cancel (`null`) → unchanged; connector failure → stays `unset`, error surfaced, nothing persisted — FR-001/002/008/012, SC-001/007
- [X] T020 [P] [US1] Screen tests: `VaultRoute` in `src/app/routes/vault/VaultRoute.test.tsx` (`unset` renders onboarding + choose button; clicking it with a fake picker transitions to `ready` showing the path + note count) **and** the first-run banner in `src/app/routes/DashboardRoute.test.tsx` (`unset` → banner present and links to `/vault`; `ready` → banner absent)

**Checkpoint**: a first-run user can connect a vault and see it confirmed — the MVP — testable on its own.

---

## Phase 4: User Story 2 - The vault is remembered across restarts (Priority: P2)

**Goal**: A configured vault is active on next launch without re-choosing; a stored path that's now missing/inaccessible surfaces a clear recovery prompt (no crash, no stray access) with re-choose/retry.

**Independent Test**: Seed `vault.path` and mount with a connector that succeeds → `ready` with no picker call (simulated restart). Seed `vault.path` and mount with a connector that returns `unavailable` → state `unavailable`, recovery UI shown, no throw; `retry` with a now-succeeding connector → `ready`.

### Implementation for User Story 2

- [X] T021 [US2] Implement `retry()` in `src/app/providers/VaultProvider.tsx`: re-run `connect` against the currently-stored path, transitioning `unavailable`/`checking` → `ready` | `unavailable` (depends on T012)
- [X] T022 [US2] Recovery UI in `src/app/routes/vault/VaultRoute.tsx` for `unavailable`: show the stored path + a clear "vault unavailable" message, a "Re-choose" button (`chooseVault`) and a "Retry" button (`retry`) — never a crash or blank screen (depends on T017)

### Tests for User Story 2

- [X] T023 [P] [US2] Persistence test in `src/app/providers/VaultProvider.test.tsx` (or a `*.persistence.test.tsx`): a pre-seeded `vault.path` + a succeeding connector → mounts straight to `ready` with **no** picker invocation — FR-003 / SC-002
- [X] T024 [P] [US2] Recovery test: a pre-seeded `vault.path` + a connector returning `unavailable` → state `unavailable` (no throw, no other access); `retry` with a now-succeeding connector → `ready` — FR-007 / SC-004

**Checkpoint**: restart-persistence and graceful recovery both work and are independently tested.

---

## Phase 5: User Story 3 - Change the vault later (Priority: P3)

**Goal**: From a configured vault, the user can switch to a different folder; the current vault is always visible; re-selecting the same folder is a no-op.

**Independent Test**: From `ready`, invoke `changeVault`; picker returns a different path; connector succeeds → `ready` with the new path, persisted. Re-select the already-active path → still `ready`, unchanged (idempotent).

### Implementation for User Story 3

- [X] T025 [US3] Expose `changeVault()` in `src/app/providers/VaultProvider.tsx` (alias of `chooseVault`'s flow — current vault stays until a new one connects) and make re-selecting the active path idempotent (same path + ok → stays `ready`, no disruption) (depends on T014)
- [X] T026 [US3] "Change vault" affordance in `src/app/routes/vault/VaultRoute.tsx` for the `ready` state (button calling `changeVault`), with the current path always displayed (depends on T017)

### Tests for User Story 3

- [X] T027 [P] [US3] Change test in `src/app/providers/VaultProvider.test.tsx` (or `*.change.test.tsx`): from `ready`, `changeVault` + a different path + ok → `ready` with the new path and `vault.path` updated; re-selecting the active path → idempotent (`ready`, count unchanged) — FR-006 / US3

**Checkpoint**: all three stories pass independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T028 [P] Update `CLAUDE.md` "Current focus" to mark 006 implemented (vault-path configuration landed; the 005 read path now reachable in the running app)
- [X] T029 Run `npm run lint`, `npx tsc -p tsconfig.json --noEmit`, and `npm run test` — confirm lint/confinement, typecheck (incl. the not-unit-tested `picker.ts`/`connect.ts`), and the full suite are green (SC-006: no network code); fix any failures
- [ ] T030 [P] **Runtime check (user, GUI)**: `npm run tauri dev` — first run shows onboarding → pick your vault (path + note count); restart → still connected; rename the folder + restart → recovery prompt (no crash, no stray access); change to another folder; confirm zero network and nothing outside the chosen folder / under `.obsidian/` is touched (quickstart.md — deferred to the user; this is also the first real run of the 005 read path)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no deps — start immediately.
- **Foundational (Phase 2)**: depends on Setup (T011 needs the T002 command) — **BLOCKS all user stories**.
- **US1 (Phase 3)**: depends on Foundational. The MVP.
- **US2 (Phase 4)**: depends on Foundational; its recovery UI extends US1's `VaultRoute`, so US1's screen lands first. Independently testable (boot-load is foundational; US2 owns recovery + retry + the persistence/recovery tests).
- **US3 (Phase 5)**: depends on Foundational + US1's `chooseVault` (changeVault reuses it) and `VaultRoute`.
- **Polish (Phase 6)**: after all desired stories.

### Key Cross-Task Dependencies

- T002 → T001. T006 → T005. T007 → T004, T006. T008 → T007. T011 → T002. T012 → T007, T009, T010, T011. T013 → T012.
- T014 → T012. T017 → T014. T018 → T012. T021 → T012. T022 → T017. T025 → T014. T026 → T017.
- T029 after all implementation + tests.

### Same-File Notes (sequential, not parallel)

- `src/app/providers/VaultProvider.tsx`: T012 (scaffold/boot) → T014 (chooseVault) → T021 (retry) → T025 (changeVault/idempotency).
- `src/app/routes/vault/VaultRoute.tsx`: T017 (onboarding/ready) → T022 (recovery) → T026 (change).
- `package.json`: T001 only.

---

## Parallel Opportunities

- **Setup**: T001 ‖ T003; T002 after T001.
- **Foundational**: T004 ‖ T005 ‖ T009 ‖ T010 (different files); then T006, T007, T011; T012; then T008 ‖ T013.
- **US1**: T015 ‖ T016 ‖ T018 (different files) alongside T014; T017 after T014; tests T019 ‖ T020.
- **US2**: tests T023 ‖ T024.
- **US3**: test T027.
- **Polish**: T028 ‖ T030; T029 after.

### Parallel Example: Foundational primitives

```bash
Task: "SettingSchema in src/db/models/setting.ts"
Task: "m0002 migration in src/db/migrations/m0002_settings.ts"
Task: "VAULT_PATH_KEY in src/app/providers/vault/keys.ts"
Task: "Production FolderPicker in src/app/providers/vault/picker.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL — blocks everything).
2. Phase 3 US1: `chooseVault` + nav/route/mount + the onboarding/status screen + the two US1 tests.
3. **STOP and VALIDATE**: a fresh user can pick a vault and see "connected, N notes" — the gate that unblocks every knowledge feature.

### Incremental Delivery

1. Setup + Foundational → persistence + the provider's boot state machine.
2. + US1 → first-run connect (tested) — MVP.
3. + US2 → remembered across restarts + graceful recovery (tested).
4. + US3 → change the vault (tested).
5. Polish → docs + full green suite + the GUI runtime check.

### Notes

- Provider/screen tests run in jsdom with a real `NodeSqlExecutor` (persistence is real) + injected fake `picker`/`connect` — the Tauri dialog, the `grant_vault_access` invoke, and `createVault`'s `TauriVaultFs` are the only non-unit-tested surfaces (behind the seams), exercised by the user's `tauri dev` (T030), consistent with 003–005.
- The 005 vault layer is reused unchanged; this feature adds no `.md` I/O and performs no probe writes (Constitution I).
- All git operations remain the user's.
