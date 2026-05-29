import { NotificationsSettings } from "../../../features/notifications/NotificationsSettings";

/**
 * App-level settings (Feature 014). Not vault-gated — preferences like reminders can be configured
 * without a connected vault (the reminder simply finds no pending work). Currently hosts the
 * Notifications section; future app-level settings join here.
 */
export function SettingsRoute() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-text">Settings</h1>
      <NotificationsSettings />
    </div>
  );
}
