# Contract — `Notifier` seam (`src/notifications/`)

The single abstraction over OS notifications (Constitution IV). Mirrors `VaultFs` / `SourceFiles`: a thin interface, a Tauri adapter that is the **only** importer of `@tauri-apps/plugin-notification`, and a DI provider so the scheduler + settings UI are testable under jsdom.

## `Notifier` (`src/notifications/notifier.ts`)

```ts
export interface Notifier {
  /** Whether OS notification permission is currently granted. */
  isPermissionGranted(): Promise<boolean>;
  /** Prompt for permission; resolves to the resulting state. */
  requestPermission(): Promise<"granted" | "denied" | "default">;
  /** Show an immediate native notification. Best-effort; rejects only on a hard platform error. */
  notify(input: { title: string; body: string }): Promise<void>;
}
```

- The interface mentions **no** Tauri types (no leaky abstraction).
- `notify` is fire-immediately (desktop has no reliable scheduled-notification API — see research R1).

## Tauri adapter (`src/notifications/adapters/tauri.ts`)

- The **only** module importing `@tauri-apps/plugin-notification` (`isPermissionGranted`, `requestPermission`, `sendNotification`). Enforced by an ESLint `no-restricted-imports` entry confining that import to `src/notifications/adapters/**`.
- `requestPermission()` maps the plugin's result to `"granted" | "denied" | "default"`.
- `notify()` → `sendNotification({ title, body })`.
- Exposes `tauriNotifier: Notifier`.

## DI provider (`src/notifications/NotifierProvider.tsx`)

- `NotifierProvider` supplies a `Notifier` via context; **default** = `tauriNotifier` at the app composition root (`main.tsx`). Tests inject a fake (records `notify` calls, returns a chosen permission state) so the native plugin never runs under jsdom — mirrors `SourceFilesProvider`/`VaultProvider`.
- `useNotifier(): Notifier`.

## Capability / wiring (Rust, config-only — research R5)

- `src-tauri/Cargo.toml`: `tauri-plugin-notification = "2"`.
- `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_notification::init())`.
- `src-tauri/capabilities/default.json`: add `"notification:default"`.
- No custom Rust command.

## Testability

- Component/scheduler tests inject a **fake** `Notifier` (no Tauri). Assertions: permission requested on enable; `notify` called with the right summary; denied/unsupported handled.
- The adapter itself is exercised only in the live `tauri dev` quickstart (it touches the OS).
