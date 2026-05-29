/**
 * The single abstraction over OS notifications (Feature 014, Constitution IV). Features depend on
 * THIS seam — never on `@tauri-apps/plugin-notification` (confined to `src/notifications/adapters/*`
 * by ESLint). Mirrors the `VaultFs` / `SourceFiles` pattern so the scheduler + settings UI stay
 * testable under jsdom (tests inject a fake via `NotifierProvider`).
 */
export type NotificationPermission = "granted" | "denied" | "default";

export interface Notifier {
  /** Whether OS notification permission is currently granted. */
  isPermissionGranted(): Promise<boolean>;
  /** Prompt for permission; resolves to the resulting state. */
  requestPermission(): Promise<NotificationPermission>;
  /** Show an immediate native notification. Best-effort; rejects only on a hard platform error. */
  notify(input: { title: string; body: string }): Promise<void>;
}
