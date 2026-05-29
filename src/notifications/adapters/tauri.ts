import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Notifier } from "../notifier";

/**
 * Production `Notifier` over `@tauri-apps/plugin-notification` (Feature 014). The ONLY module that
 * imports the notification plugin (ESLint-confined to `src/notifications/adapters/**`); everything
 * else depends on the `Notifier` seam. The plugin's `schedule` API is mobile-only, so desktop uses
 * immediate `sendNotification` and the in-app `ReminderScheduler` owns the timing (research R1).
 *
 * Focus-on-click (FR-009) is best-effort: clicking a desktop toast already activates the app on the
 * supported platforms; the plugin exposes no reliable cross-platform click hook, so nothing extra is
 * wired here.
 */
export const tauriNotifier: Notifier = {
  isPermissionGranted() {
    return isPermissionGranted();
  },
  requestPermission() {
    return requestPermission();
  },
  async notify({ title, body }) {
    sendNotification({ title, body });
  },
};
