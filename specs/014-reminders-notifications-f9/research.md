# Research — Reminders / Notifications (Feature 014)

Phase 0 decisions. Each: **Decision · Rationale · Alternatives rejected.**

---

## R1 — Scheduling is **in-app (foreground)**, not plugin-scheduled

**Decision**: While the app is running, an in-app interval (a React provider mounted at the app root) evaluates the fire condition roughly once a minute and calls the notifier's immediate "send" when it's time. We do **not** use the notification plugin's `schedule`/`Schedule.at` API.

**Rationale**: `tauri-plugin-notification`'s scheduled/recurring notifications (`Schedule.at`, `.interval`) are **mobile-only**; on desktop the reliable surface is immediate `sendNotification` + the permission APIs (`isPermissionGranted`, `requestPermission`). CIC is a desktop app, and the spec already scopes v1 to "fires only while the app is running" (background-when-closed is out of scope). An in-app clock check is the simplest thing that satisfies FR-005/FR-008 and is trivially testable via a pure decision function (R4).

**Alternatives rejected**:
- *Plugin `Schedule.at` recurring notification* — desktop-unsupported; would silently no-op on the target platform.
- *OS task scheduler / autostart background process to fire when the app is closed* — explicitly out of scope for v1 (heavier: autostart, a background runtime, lifecycle/permissions); deferred.

---

## R2 — A `Notifier` seam + adapter + DI provider (Constitution IV)

**Decision**: Add a thin `Notifier` interface (`src/notifications/notifier.ts`) with a Tauri adapter (`src/notifications/adapters/tauri.ts`, the **only** importer of `@tauri-apps/plugin-notification`) and a `NotifierProvider` (default = the Tauri impl; tests inject a fake). Extend the ESLint `no-restricted-imports` rule to confine `@tauri-apps/plugin-notification` to `src/notifications/adapters/**`.

**Rationale**: Mirrors the established native-bridge pattern (`VaultFs` in `src/vault/adapters`, the SQL adapter in `src/db/adapters`, `SourceFiles` DI). Confining the plugin behind a seam keeps the scheduler logic + settings UI **jsdom-testable** (no native calls) and makes the abstraction mechanically unbypassable (Constitution IV). The seam is tiny: `isPermissionGranted()`, `requestPermission()`, `notify({title, body})`.

**Alternatives rejected**:
- *Import the plugin directly in the hook/components (like `SourceFiles` does with `plugin-dialog`, which is unconfined)* — would make the scheduler/settings untestable under jsdom and bypass the seam; the ESLint confinement is cheap and matches the sql/fs precedent, which is the stronger convention for anything the test suite must run.

---

## R3 — No schema / no migration; config in settings KV, signals derived

**Decision**: No new table or migration. Reminder config lives in the Feature-006 settings key-value store under `notifications.enabled` / `notifications.time` / `notifications.lastFired`, behind a typed accessor (mirrors `getNewCardCap` in `cards.ts`). The "pending work" and "practiced today" signals are **derived** from existing data at evaluation time.

**Rationale**: There is no durable new entity — config is three scalars and a bookkeeping date, exactly what the KV store is for. Pending work already has reads: `countDueCards(vaultId, now, cap)` (Feature 010) and the planned-session list (Features 012/013 — add a cheap `countPlannedSessions`). "Practiced today" is two small same-day existence checks (a review today, a session completed today), added to their home repos. Deriving avoids drift and needs zero migration.

**Alternatives rejected**:
- *A `notifications` table* — over-modeled for three scalars; the KV store (which already holds `srs.dailyNewCap`, the vault path) is the precedent.
- *A denormalized "pending count" cache* — drift risk; the counts are cheap and already computed for the dashboard.

---

## R4 — A pure `decideReminder(now, config, signals)` decision function

**Decision**: All the fire logic is a pure function: given `now` (local), the config (enabled, time, lastFired), and `signals` (`dueCount`, `plannedCount`, `practicedToday`), it returns `{ title, body } | null`. The provider does the IO: read config + signals, call `decideReminder`, and on a non-null result `notify(...)` then persist `lastFired = today`.

**Rationale**: Concentrates every rule (enabled? permission is checked separately; at-most-once-per-day via `lastFired !== today`; time reached via `now >= time`; pending > 0; not practiced today; summary text) in one unit-testable function with no clock or IO. The "fire if `now >= time` and not fired today" formulation **gives catch-up for free** (FR/Assumption): opening the app after the configured time still nudges once.

**Alternatives rejected**:
- *Fire exactly at `now == time`* — brittle (depends on the interval landing on the minute) and gives no catch-up when the app was opened late.
- *Logic inside the provider/effect* — untestable without faking timers + IO; the pure split is cleaner.

---

## R5 — Wire the locked-but-unwired `tauri-plugin-notification` (config-only Rust touch)

**Decision**: Add `tauri-plugin-notification` to `src-tauri/Cargo.toml`, register `.plugin(tauri_plugin_notification::init())` in `src-tauri/src/lib.rs`, add `notification:default` to `src-tauri/capabilities/default.json`, and add `@tauri-apps/plugin-notification` to `package.json`. **No custom Rust command** — the plugin's JS API + capability are sufficient.

**Rationale**: `tauri-plugin-notification` is already a **locked native bridge** in the Constitution/PRD (v0.5) — this feature simply wires it. The Rust change is standard plugin registration (config, not custom native logic), flagged per the Tech-Constraint as the prior plugin wirings were.

**Commit note (carry to implement)**: 014 *legitimately* modifies `src-tauri/` (Cargo.toml + lib.rs + capabilities), unlike 013. The standing "exclude `src-tauri/Cargo.lock`/`Cargo.toml`" guard was about an unrelated prior `tauri dev` regen — at commit time the **notification-plugin** additions to `Cargo.toml` (and the matching `Cargo.lock` entries) must be **included**, and disentangled from that prior regen noise. Flag to the user at commit.

**Alternatives rejected**:
- *A custom Rust notification command* — unnecessary; the plugin covers send + permission.

---

## R6 — A new `/settings` route is the Notifications home

**Decision**: Add a top-level `/settings` route + a nav entry, with a **Notifications** section (`NotificationsSettings`). Not vault-gated.

**Rationale**: There is no general settings screen yet (the `srs.dailyNewCap` key has no UI). A `/settings` home is the natural, discoverable place for app-level preferences and gives future settings (e.g. the new-card cap) a home. Configuring notifications doesn't require a connected vault — the reminder simply finds no pending work when none is connected — so the route isn't vault-gated.

**Alternatives rejected**:
- *A Notifications panel on the `/vault` route* — conflates vault config with app-level preferences; reminders aren't vault-specific config.
- *No route, settings only in a modal* — less discoverable; a route is consistent with the rest of the app.

---

## R7 — Focus-on-click is best-effort (FR-009)

**Decision**: Treat "clicking the reminder focuses the app" as best-effort: wire window-focus on a notification activation event if the plugin surfaces one simply on desktop; otherwise document the limitation. It never blocks the core (the notification appearing).

**Rationale**: Desktop click-through handling in `tauri-plugin-notification` is limited and platform-dependent (the action/`onAction` API is mobile-oriented). The value is the nudge; focus-on-click is a nicety. FR-009 is a SHOULD.

**Alternatives rejected**:
- *Block the feature on robust cross-platform click handling* — disproportionate; the OS already lets the user click the app.
