# Implementation Plan: Reminders / Notifications

**Branch**: `014-reminders-notifications-f9` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-reminders-notifications-f9/spec.md`

## Summary

Wire the locked-but-unwired `tauri-plugin-notification` to give CIC **native desktop reminders** that nudge the learner to practice when work is waiting. A new **Notifications settings** surface (enable, daily time, permission, test notification) plus an app-wide **in-app scheduler** that, while the app runs, fires one native notification at the configured time — but only when there's pending work (due reviews from 010 and/or planned sessions from 012/013) for the active vault and the learner hasn't already practiced today.

**Technical shape**: no migration (config in the settings KV; signals derived); a thin `Notifier` seam + Tauri adapter + DI provider (Constitution IV); a pure `decideReminder` function with a headless `ReminderScheduler` provider doing the IO; a few small read-models (`countPlannedSessions`, `hasReviewOnDay`, `hasSessionCompletedOnDay`); a `/settings` route. Config-only Rust touch (plugin registration + a `notification:default` capability).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19, Vite. One config-only Rust/Cargo touch (plugin wiring; no custom command).

**Primary Dependencies**: `@tauri-apps/plugin-notification` (NEW, behind the `Notifier` seam) + `tauri-plugin-notification` crate; existing `src/db` reads (`countDueCards`, `getNewCardCap`, planned sessions, reviews), the settings KV (006), `VaultProvider` (active vault id), React Router, zod.

**Storage**: SQLite — **no schema change**. Reminder config in the `settings` table (`notifications.enabled|time|lastFired`). No vault writes.

**Testing**: Vitest — pure `decideReminder` unit tests; node-adapter tests for the new read-models; jsdom + `renderApp` for the settings UI and a scheduler-tick test, both with a **fake `Notifier`** (no native calls). The live OS notification is the `tauri dev` quickstart.

**Target Platform**: Tauri desktop (Windows/macOS/Linux), fully offline. Foreground-only scheduling for v1.

**Project Type**: Desktop app (single-user, local-first).

**Performance Goals**: A ~60s interval running two small COUNT/EXISTS queries — negligible. The notification is immediate.

**Constraints**: Offline, no network, no AI; vault-sacred (no vault writes — trivial); preserve desirable difficulty (cadence nudge only, suppressed once practiced, no mastery wording).

**Scale/Scope**: Personal use. One settings section, one headless provider, one pure function, ~3 small read-models, the `Notifier` seam/adapter/provider, and the plugin wiring.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | How this feature complies |
|---|---|---|
| **I. Vault Sacred** | ✅ PASS (trivial) | **No vault writes.** Config is in the SQLite settings KV; notifications are OS-native. The vault is untouched. |
| **II. AI Vendor-Agnostic** | ✅ PASS (trivial) | No AI, no vendor SDKs. Reminder text is a fixed local string + counts. |
| **III. Desirable Difficulty** | ✅ PASS (central) | Reminders nudge **cadence only** — they reveal no answers, mark nothing learned/mastered, and are **suppressed once the learner has practiced today** (FR-010). Copy is calm, never streak-shaming (FR-011). |
| **IV. Interface-First Deep Modules** | ✅ PASS | A thin `Notifier` seam; the `@tauri-apps/plugin-notification` import is confined to `src/notifications/adapters/**` (ESLint `no-restricted-imports`, like sql/fs). The scheduler depends on the seam + a pure decision fn; the composition root wires the Tauri impl, tests inject a fake. |
| **V. Spec-Driven** | ✅ PASS | Spec validated (0 clarifications); this plan + full Phase-1 doc set; mandatory walkthrough at the end. Wires the §6 locked `tauri-plugin-notification` bridge; reconciled into the PRD (F9). |

**No violations.** Complexity Tracking is empty.

**Flagged (Tech-Constraint)**: this feature makes a **config-only Rust touch** — `tauri-plugin-notification` in `Cargo.toml`, `.plugin(...init())` in `lib.rs`, and `notification:default` in `capabilities/default.json`. Standard plugin wiring (no custom command). **Commit note**: unlike 013, 014 *legitimately* changes `src-tauri/`; the notification additions to `Cargo.toml`/`Cargo.lock` must be **included** at commit and disentangled from the prior unrelated `tauri dev` regen the user asked to keep excluded.

## Project Structure

### Documentation (this feature)

```text
specs/014-reminders-notifications-f9/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   ├── notifier.md            # the Notifier seam + Tauri adapter + DI provider + capability
│   ├── reminder-scheduler.md  # decideReminder (pure) + ReminderScheduler provider + signal read-models
│   └── ui-notifications.md     # the /settings route + NotificationsSettings UI
└── tasks.md                   # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── notifications/
│   ├── notifier.ts                 # NEW — the Notifier interface (seam; no Tauri import)
│   ├── adapters/tauri.ts           # NEW — tauriNotifier (ONLY importer of @tauri-apps/plugin-notification)
│   └── NotifierProvider.tsx        # NEW — DI provider (default tauriNotifier; tests inject a fake)
├── features/notifications/
│   ├── config.ts                   # NEW — getReminderConfig / setReminderEnabled / setReminderTime / markReminderFired (settings KV + zod)
│   ├── schedule.ts                 # NEW — decideReminder (pure)
│   ├── schedule.test.ts            # NEW — pure decision tests
│   ├── ReminderScheduler.tsx       # NEW — headless app-wide scheduler (interval → decideReminder → notify + markFired)
│   ├── useReminderSettings.ts      # NEW — load/save config for the settings UI
│   ├── NotificationsSettings.tsx   # NEW — the Notifications settings section
│   └── NotificationsSettings.test.tsx # NEW — settings UI tests (fake Notifier)
├── app/
│   ├── routes/settings/SettingsRoute.tsx  # NEW — /settings route hosting NotificationsSettings
│   ├── router.tsx                  # MODIFIED — add /settings
│   ├── layout/AppShell.tsx         # MODIFIED — add a Settings nav entry
│   └── main.tsx                    # MODIFIED — wrap with NotifierProvider + mount ReminderScheduler
├── db/repositories/
│   ├── sessions.ts                 # MODIFIED — countPlannedSessions, hasSessionCompletedOnDay
│   ├── sessions.test.ts            # MODIFIED — tests for the two new reads
│   ├── reviews.ts                  # MODIFIED — hasReviewOnDay
│   └── reviews.test.ts             # MODIFIED — test for hasReviewOnDay
eslint.config.js                    # MODIFIED — confine @tauri-apps/plugin-notification to src/notifications/adapters/**
src-tauri/
├── Cargo.toml                      # MODIFIED — tauri-plugin-notification = "2"
├── src/lib.rs                      # MODIFIED — .plugin(tauri_plugin_notification::init())
└── capabilities/default.json       # MODIFIED — add "notification:default"
package.json                        # MODIFIED — @tauri-apps/plugin-notification
```

**Structure Decision**: A dedicated `src/notifications/` spine dir for the seam/adapter/provider (mirrors `src/vault`), and `src/features/notifications/` for the feature logic (config, pure schedule, scheduler, settings UI). Data access stays behind `src/db`; the only genuinely new, isolated logic worth unit-testing is the **pure `decideReminder`** and the **read-models**. The `ReminderScheduler` is a headless provider mounted once at the app root.

## Phase 0 — Research (decisions)

See [research.md](./research.md). Headlines: **R1** in-app foreground scheduling (the plugin's `schedule` is mobile-only; desktop = immediate send) · **R2** `Notifier` seam + adapter + DI, plugin ESLint-confined · **R3** no migration (config in settings KV; signals derived) · **R4** pure `decideReminder` (catch-up falls out of `now >= time`) · **R5** config-only Rust wiring of the locked plugin (+ the commit note) · **R6** a new `/settings` route as the Notifications home · **R7** focus-on-click is best-effort.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the settings keys + accessor, the derived signals, the `decideReminder` input/rule, validation.
- [contracts/notifier.md](./contracts/notifier.md) — the `Notifier` seam, Tauri adapter, DI provider, capability/Cargo wiring.
- [contracts/reminder-scheduler.md](./contracts/reminder-scheduler.md) — `decideReminder` (pure), the `ReminderScheduler` provider, and the new read-models.
- [contracts/ui-notifications.md](./contracts/ui-notifications.md) — the `/settings` route + `NotificationsSettings`.
- [quickstart.md](./quickstart.md) — the live `tauri dev` walkthrough (A–I).

**Agent context update:** the `<!-- SPECKIT … -->` plan reference in `CLAUDE.md` is pointed at this plan.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
