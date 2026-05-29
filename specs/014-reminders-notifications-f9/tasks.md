# Tasks: Reminders / Notifications

**Input**: Design documents from `specs/014-reminders-notifications-f9/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: INCLUDED. Project conventions (`CLAUDE.md`) require unit tests for core logic; the contracts specify Testability. The pure `decideReminder` + the new read-models are node/unit tested; the settings UI and the scheduler tick are jsdom-tested with a **fake `Notifier`** (no native calls). The live OS notification is the `tauri dev` quickstart.

**Organization**: by user story — US1 (P1) configure + permission + test, US2 (P2) the scheduled fire, US3 (P3) "already-practiced-today" suppression — behind Setup (plugin wiring) + a Foundational phase (the `Notifier` seam + config accessors).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup/Foundational/Polish carry no story label)

⚠️ **Shared-file reality**: `src/features/notifications/ReminderScheduler.tsx` (US2 create → US3 wire), `src/db/repositories/sessions.ts` (US2 `countPlannedSessions` → US3 `hasSessionCompletedOnDay`), and `src/main.tsx` (Foundational `NotifierProvider` → US2 mount scheduler) are each touched more than once — those edits are **sequential**.

⚠️ **`src-tauri/` is touched this feature** (config-only: plugin dep + init + capability). Unlike 013, the notification additions to `Cargo.toml`/`Cargo.lock` **must be committed** — disentangle them from the prior unrelated `tauri dev` regen at commit time (research R5).

---

## Phase 1: Setup

**Purpose**: Wire the locked-but-unwired `tauri-plugin-notification` and the ESLint confinement so the seam can be built.

- [X] T001 Confirm on branch `014-reminders-notifications-f9`; run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` and note the green baseline (014 must keep it green).
- [X] T002 [P] Add the notification plugin deps: `@tauri-apps/plugin-notification` to `package.json` (and install) + `tauri-plugin-notification = "2"` to `src-tauri/Cargo.toml`.
- [X] T003 Register the plugin: `.plugin(tauri_plugin_notification::init())` in `src-tauri/src/lib.rs` (alongside the existing plugins) and add `"notification:default"` to the `permissions` array in `src-tauri/capabilities/default.json`. No custom command.
- [X] T004 [P] Extend `eslint.config.js` `no-restricted-imports`: forbid `@tauri-apps/plugin-notification` everywhere except `src/notifications/adapters/**` (mirror the sql/fs entries + their adapter-dir override).

**Checkpoint**: deps present, plugin registered + permitted, import confined. `cargo check` and `npm run build` still pass.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `Notifier` seam + DI and the reminder-config accessors that BOTH user stories depend on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T005 [P] Create the `Notifier` interface in `src/notifications/notifier.ts` — `isPermissionGranted()`, `requestPermission(): "granted"|"denied"|"default"`, `notify({title, body})`. No Tauri import (seam only; per contracts/notifier.md).
- [X] T006 Create the Tauri adapter `src/notifications/adapters/tauri.ts` — `tauriNotifier: Notifier`, the ONLY importer of `@tauri-apps/plugin-notification` (`isPermissionGranted`/`requestPermission`/`sendNotification`). Focus-on-click is best-effort (FR-009) — wire it only if trivial, else leave a short note. (Depends on T005, T002/T003.)
- [X] T007 Create `src/notifications/NotifierProvider.tsx` — a context DI provider defaulting to `tauriNotifier`; `useNotifier()`. Mirrors `SourceFilesProvider`. (Depends on T005/T006.)
- [X] T008 [P] Create reminder-config accessors in `src/features/notifications/config.ts` — `getReminderConfig(db)` (zod-parsed, defaults applied, never throws on a bad stored value), `setReminderEnabled`, `setReminderTime`, `markReminderFired(db, day)` over the settings KV keys `notifications.enabled|time|lastFired` (per data-model.md).
- [X] T009 Wire `NotifierProvider` into the composition root `src/main.tsx` (under `DbProvider`/`VaultProvider`, around the router). (Depends on T007.)
- [X] T010 Update `src/app/test-support.tsx` `renderApp` to wrap children in `NotifierProvider` with an injectable `notifier?` option (defaulting to a benign fake), so component tests can supply a fake — mirrors the `sourceFiles` seam. **Do NOT mount `ReminderScheduler` in `renderApp`** (it would fire in unrelated tests — F1); the scheduler is tested in isolation (T019). (Depends on T007.)
- [X] T011 [P] Node-adapter tests for the config accessors in `src/features/notifications/config.test.ts` — enabled/time round-trip; defaults when unset; a malformed `time`/`enabled` falls back without throwing; `markReminderFired` persists the day.

**Checkpoint**: `npm test` green; the seam + DI + config layer exist and are injectable. User stories can begin.

---

## Phase 3: User Story 1 — Set up and verify reminders (Priority: P1) 🎯 MVP

**Goal**: A `/settings` → Notifications surface where the learner enables reminders (requesting OS permission, handling denial), sets a daily time, and fires a **test notification** — all persisted.

**Independent Test**: Open `/settings`, enable reminders → permission requested; click "Send test notification" → `notify` called; deny permission → explanation shown, no crash; set a time → persists across reload.

### Tests for User Story 1 (write first, ensure they FAIL)

- [X] T012 [P] [US1] Component tests in `src/features/notifications/NotificationsSettings.test.tsx` (`renderApp` at `/settings`, **fake Notifier**): enabling calls `requestPermission` + saves enabled; "Send test notification" calls `notify`; a denied/`unsupported` permission shows the explanation and does not throw; setting a time persists (re-read via `getReminderConfig`); re-render shows the saved enabled state + time.

### Implementation for User Story 1

- [X] T013 [US1] `src/features/notifications/useReminderSettings.ts` — load `getReminderConfig`, expose the current config + `setEnabled`/`setTime`/`sendTest` (the last calls `useNotifier().notify`, requesting permission first if needed).
- [X] T014 [US1] `src/features/notifications/NotificationsSettings.tsx` — the enable toggle (requests permission on enable; denied → calm explanation + OS-settings guidance, no crash), the daily-time input, and the "Send test notification" button. Calm, cadence-only copy; Obsidian tokens (no cyan); labelled controls. (Per contracts/ui-notifications.md.)
- [X] T015 [US1] `src/app/routes/settings/SettingsRoute.tsx` — the `/settings` page hosting a Notifications section (`NotificationsSettings`). Not vault-gated.
- [X] T016 [US1] Add `/settings` to `src/app/router.tsx` and a **Settings** entry to the nav in `src/app/layout/AppShell.tsx`.

**Checkpoint**: US1 fully functional — reminders can be configured, permission handled, a test notification verified; settings persist. MVP deliverable.

---

## Phase 4: User Story 2 — Get reminded when work is waiting (Priority: P2)

**Goal**: While the app runs, one native notification fires at the configured time when there's pending work for the active vault, summarizing the counts; at most once/day; catch-up on a late open.

**Independent Test**: With reminders enabled + pending work, drive a scheduler tick at/after the configured time (injected `now`) → exactly one `notify` with the right summary + `lastFired` written; a second tick the same day → no second `notify`; no pending → none.

### Tests for User Story 2 (write first, ensure they FAIL)

- [X] T017 [P] [US2] Pure tests in `src/features/notifications/schedule.test.ts` for `decideReminder(now, config, signals)`: disabled → null; already fired today → null; time not reached → null; no pending → null; **practiced today → null** (rule owned here); eligible → `{title, body}` with the summary (both sides / each single side, zero side omitted); catch-up (`now` past time, not fired) → fires. **(G2)** also assert the fired `{title, body}` contains no `"mastered"`/`"learned"`/streak-shaming wording (FR-011/Constitution III).
- [X] T018 [P] [US2] Repo test in `src/db/repositories/sessions.test.ts` for `countPlannedSessions(db, vaultId)` — counts only the active vault's `planned` sessions (vault-scoped; completed excluded; other vault excluded).
- [X] T019 [P] [US2] Scheduler test in `src/features/notifications/ReminderScheduler.test.tsx` — **(F1)** render `<ReminderScheduler>` **directly**, wrapped in `DbProvider`/`VaultProvider`/`NotifierProvider` with a **fake Notifier**, a seeded node DB, and an injected `now` (NOT via `renderApp`/a route — the scheduler is headless and lives only in `main.tsx`). Assert: enabled + permission granted + pending work + not practiced + past time → exactly one `notify` summarizing counts and `notifications.lastFired` set; a second tick same day → no second `notify`; permission denied → no `notify`; no pending → no `notify`. **(G3)** the scheduler has no `VaultWriter` dependency (structural) — confirm its only side effects are the fake `notify` + the `notifications.lastFired` settings write (no vault file, no other table).

### Implementation for User Story 2

- [X] T020 [US2] Add `countPlannedSessions(db, vaultId): Promise<number>` to `src/db/repositories/sessions.ts` — `COUNT(*)` of `status='planned'` for the vault (reuse the `course → domain` vault join).
- [X] T021 [US2] Implement `decideReminder` in `src/features/notifications/schedule.ts` (pure; per data-model.md/contracts) including the local-day / local-time helpers and the summary builder. **(C1)** `config.lastFired` is a single **global** key — once/day is global across vaults by design (FR-008); only the pending/practiced signals are per-vault. The fixed title/body are calm + cadence-only (no "mastered"/"learned").
- [X] T022 [US2] Create `src/features/notifications/ReminderScheduler.tsx` — a headless provider: on mount + on an interval (~60s; both `now` and interval overridable for tests), read config, short-circuit if disabled or `!isPermissionGranted()`, gather signals (`countDueCards` with `getNewCardCap` + `countPlannedSessions`; `practicedToday` left false until US3), call `decideReminder`, and on a result `notify(...)` then `markReminderFired`. Renders null; never throws into the tree; **mounted only in `main.tsx` (T023), never in `renderApp`** (F1). No `VaultWriter` import (structural — G3).
- [X] T023 [US2] Mount `ReminderScheduler` in `src/main.tsx` (inside the providers, beside the router). (Same file as T009 — sequential.)

**Checkpoint**: US1 + US2 — reminders fire at the right time for the right reason, once/day, with catch-up.

---

## Phase 5: User Story 3 — Not nagged once you've shown up (Priority: P3)

**Goal**: Suppress the daily reminder when the learner has already reviewed a card or completed a session today (active vault).

**Independent Test**: With reminders enabled + pending work, record a review or completed session dated today → a scheduler tick fires no notification.

### Tests for User Story 3 (write first, ensure they FAIL)

- [X] T024 [P] [US3] Repo tests: `hasReviewOnDay(db, vaultId, dayPrefix)` in `src/db/repositories/reviews.test.ts` and `hasSessionCompletedOnDay(db, vaultId, dayPrefix)` in `src/db/repositories/sessions.test.ts` — true iff matching activity today, vault-scoped, false otherwise.
- [X] T025 [US3] Suppression integration test in `src/features/notifications/ReminderScheduler.test.tsx` — render `<ReminderScheduler>` directly (as T019, F1): pending work present but a review (or completed session) recorded today → tick fires **no** `notify`.

### Implementation for User Story 3

- [X] T026 [P] [US3] Add `hasReviewOnDay(db, vaultId, dayPrefix)` to `src/db/repositories/reviews.ts` (vault join `card → course → domain`, `substr(reviewed_at,1,10)=dayPrefix`) and `hasSessionCompletedOnDay(db, vaultId, dayPrefix)` to `src/db/repositories/sessions.ts` (`status='completed'`, `substr(completed_at,1,10)=dayPrefix`).
- [X] T027 [US3] Wire `practicedToday = hasReviewOnDay || hasSessionCompletedOnDay` into `ReminderScheduler.tsx`'s signal gathering. (Same file as T022 — sequential.)

**Checkpoint**: All three stories — reminders fire only when warranted and never nag once the learner has practiced.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T028 [P] Reconcile `PRD-CIC-Platform.md`: F9 → implemented; `tauri-plugin-notification` now wired; note no-migration (settings KV) + the in-app foreground scheduler; bump version + changelog entry.
- [X] T029 [P] Update the `<!-- SPECKIT … -->` block + Current focus in `CLAUDE.md` to mark 014 **implemented** (demote 013 to prior).
- [X] T030 Full quality gate: `npx tsc --noEmit`, `npm run lint` (incl. the new notification import confinement), `npm test`, `npm run build`, and `cargo check` in `src-tauri/` (Rust changed this feature). Clean up any stray symbols.
- [ ] T031 Live `tauri dev` walkthrough of `quickstart.md` A–I (user-run): enable + permission + test notification → set time with pending work → reminder fires once → catch-up on launch → practiced-today suppresses → nothing-pending silent → persists across restart → no vault writes / no network. The mandatory end-of-feature **walkthrough** (Constitution V) is delivered after the gate passes.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T004)** → first. T002 before T003/T006; T004 [P].
- **Foundational (T005–T011)** → after Setup; **BLOCKS all stories**. T005 before T006 before T007; T008 [P] with T005; T009/T010 after T007; T011 after T008.
- **US1 (T012–T016)** → after Foundational. The MVP.
- **US2 (T017–T023)** → after Foundational. Independently testable (drive a tick); shares `main.tsx` (sequential after T009) + `sessions.ts`.
- **US3 (T024–T027)** → after Foundational; sequential after US2 on `ReminderScheduler.tsx` and `sessions.ts`. The `decideReminder` practiced-today rule already exists (T021); US3 supplies the real signal.
- **Polish (T028–T031)** → after all stories.

### Within a story

- Write the story's test tasks first and confirm they FAIL, then implement.
- Read-models / pure fns before the provider; provider before the `main.tsx` mount.

### Parallel opportunities

- **T002** ∥ **T004**; **T005** ∥ **T008** (different files).
- Within US2, the three test files (T017 pure, T018 repo, T019 scheduler) are [P] with each other, before implementation.
- US3 read-models (T026) touch two different repos but `sessions.ts` is shared with US2's `countPlannedSessions` — do US3's `sessions.ts` edit after US2's.
- **T028** (PRD) ∥ **T029** (CLAUDE) — different docs.

### Parallel example (Foundational)

```text
Task: "T005 Notifier interface in src/notifications/notifier.ts"
Task: "T008 Reminder-config accessors in src/features/notifications/config.ts"
# Different files → parallel. T006 (adapter) waits on T005; T011 (config test) waits on T008.
```

---

## Implementation Strategy

### MVP first (US1 only)

1. T001 Setup baseline → 2. T002–T004 plugin wiring → 3. T005–T011 Foundational → 4. T012–T016 US1 → **STOP & VALIDATE** (configure + permission + test notification). Shippable: the learner can set up and verify reminders.

### Incremental delivery

- + US2 (T017–T023): the daily fire gated on pending work, once/day, catch-up.
- + US3 (T024–T027): suppression once practiced today.
- Polish (T028–T031): PRD reconcile, full gate (incl. `cargo check`), CLAUDE.md, live quickstart + walkthrough.

### Guardrails to honor throughout

- **No vault writes, no network, no AI** anywhere (FR-012/FR-014) — the scheduler only reads counts and writes the `notifications.lastFired` setting.
- **Cadence nudge only** — no answers, no "learned/mastered", no streak-shaming; suppressed once practiced (Constitution III).
- **`@tauri-apps/plugin-notification` only inside `src/notifications/adapters/**`** (ESLint-enforced).
- **`src-tauri/` changes are intentional this feature** — include the notification Cargo/capability additions at commit, separate from the prior regen.

---

## Notes

- 31 tasks (T001–T031). Setup 4 · Foundational 7 · US1 5 · US2 7 · US3 4 · Polish 4.
- Pure `decideReminder` + read-models are unit/node tested (T017/T018/T024); the settings UI and scheduler tick are jsdom-tested with a fake `Notifier` (T012/T019/T025); the real OS notification is the live quickstart (T031).
- Commit held until the user authorizes; stage specific files (never `git add -A`); add the `Co-Authored-By: Claude Opus 4.7` trailer. The `after_tasks` git.commit hook is optional and not auto-run.
