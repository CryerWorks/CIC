import { useCallback, useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useNotifier } from "../../notifications/NotifierProvider";
import type { NotificationPermission } from "../../notifications/notifier";
import {
  getReminderConfig,
  setReminderEnabled,
  setReminderTime,
  type ReminderConfig,
} from "./config";

export type PermissionState = NotificationPermission | "unknown";

/**
 * Drives the Notifications settings UI (Feature 014, US1): loads the reminder config + current OS
 * permission, and exposes enable/time/test actions. Enabling requests OS permission (handling a
 * denial gracefully — the toggle still reflects intent; the scheduler re-checks permission at fire
 * time). All persistence is the settings KV; the only OS touch is via the injected `Notifier` seam.
 */
export function useReminderSettings() {
  const db = useDb();
  const notifier = useNotifier();
  const [config, setConfig] = useState<ReminderConfig | null>(null);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setConfig(await getReminderConfig(db));
    setPermission((await notifier.isPermissionGranted()) ? "granted" : "unknown");
  }, [db, notifier]);

  useEffect(() => {
    void load();
  }, [load]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const result = await notifier.requestPermission();
        setPermission(result);
        setStatus(
          result === "granted"
            ? "Reminders on. We'll nudge you when reviews or sessions are waiting."
            : "Reminders are enabled, but your OS is blocking notifications — allow them for CIC in your system settings.",
        );
      } else {
        setStatus(null);
      }
      await setReminderEnabled(db, enabled);
      await load();
    },
    [db, notifier, load],
  );

  const setTime = useCallback(
    async (hour: number, minute: number) => {
      await setReminderTime(db, hour, minute);
      await load();
    },
    [db, load],
  );

  const sendTest = useCallback(async () => {
    let granted = await notifier.isPermissionGranted();
    if (!granted) {
      const result = await notifier.requestPermission();
      setPermission(result);
      granted = result === "granted";
    }
    if (!granted) {
      setStatus("Couldn't send — notifications are blocked. Allow them for CIC in your system settings.");
      return;
    }
    await notifier.notify({ title: "CIC", body: "Test notification — reminders are working." });
    setStatus("Sent a test notification.");
  }, [notifier]);

  return { config, permission, status, setEnabled, setTime, sendTest };
}
