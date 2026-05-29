# Contract — Notifications settings UI (`src/features/notifications/` + `/settings`)

## Route

- New top-level route **`/settings`** (`SettingsRoute`) under the `AppShell`, plus a **Settings** entry in the shell nav. Not vault-gated. Its first (only, for now) section is **Notifications**.

## `NotificationsSettings` (`src/features/notifications/NotificationsSettings.tsx`)

Driven by `useReminderSettings()` (loads/saves config via the accessors) and `useNotifier()`:

- **Enable reminders** — a toggle (`notifications.enabled`). When the user turns it ON, the app calls `notifier.requestPermission()`:
  - granted → reminders active; show a confirmation.
  - denied / unsupported → show a clear, calm explanation + how to enable OS notifications; the toggle reflects "enabled in-app but blocked by the OS" without crashing (FR-003/SC-005).
- **Reminder time** — an input for the daily time (`notifications.time`, `HH:MM`), persisted on change.
- **Send test notification** — a button that calls `notifier.notify(...)` immediately (FR-004) so the user can verify delivery without waiting; if permission isn't granted it requests it first.
- Copy is calm and cadence-only — "We'll remind you when reviews or sessions are waiting" — never streak-shaming, never a mastery claim (Constitution III).
- Obsidian tokens (charcoal + purple; **no cyan** — no AI output here). Accessible: the toggle + time input have associated labels; status/errors are text, not color-only.

## Behavior

- Settings persist immediately and survive reload (FR-001/FR-002/SC-007) — backed by the settings KV.
- The page never blocks on the native layer: a denied/unsupported permission yields an inline message, not a crash (SC-005).
- The actual scheduled firing is owned by `ReminderScheduler` (mounted app-wide), not this page — this page only configures + test-fires.

## Testability

- Component tests (`renderApp` at `/settings`, **fake Notifier**): toggling enable calls `requestPermission`; "Send test notification" calls `notify`; a denied permission shows the explanation and doesn't throw; setting a time persists (re-read via the accessor); reload (re-render) shows the saved enabled state + time.
- No assertion drives a real OS notification — that's the live `tauri dev` quickstart.
