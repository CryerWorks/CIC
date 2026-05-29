import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, makeReadyDb } from "../../app/test-support";
import type { Notifier, NotificationPermission } from "../../notifications/notifier";
import { getReminderConfig, setReminderEnabled, setReminderTime } from "./config";
import type { SqlExecutor } from "../../db";

function fakeNotifier(opts: { granted?: boolean; permission?: NotificationPermission } = {}): Notifier {
  return {
    isPermissionGranted: vi.fn().mockResolvedValue(opts.granted ?? false),
    requestPermission: vi.fn().mockResolvedValue(opts.permission ?? "granted"),
    notify: vi.fn().mockResolvedValue(undefined),
  };
}

function renderSettings(db: SqlExecutor, notifier: Notifier) {
  return renderApp({
    initialEntries: ["/settings"],
    initialize: () => Promise.resolve(db),
    notifier,
  });
}

describe("NotificationsSettings (US1 / Feature 014)", () => {
  it("enabling reminders requests OS permission and persists the enabled state", async () => {
    const db = await makeReadyDb();
    const notifier = fakeNotifier({ permission: "granted" });
    renderSettings(db, notifier);

    await userEvent.click(await screen.findByLabelText("Enable reminders"));

    expect(notifier.requestPermission).toHaveBeenCalled();
    await waitFor(async () => expect((await getReminderConfig(db)).enabled).toBe(true));
  });

  it("sends a test notification on demand", async () => {
    const db = await makeReadyDb();
    const notifier = fakeNotifier({ granted: true });
    renderSettings(db, notifier);

    await userEvent.click(await screen.findByRole("button", { name: "Send test notification" }));

    await waitFor(() => expect(notifier.notify).toHaveBeenCalled());
    expect(await screen.findByText(/sent a test notification/i)).toBeTruthy();
  });

  it("explains (and does not crash) when OS permission is denied", async () => {
    const db = await makeReadyDb();
    const notifier = fakeNotifier({ permission: "denied" });
    renderSettings(db, notifier);

    await userEvent.click(await screen.findByLabelText("Enable reminders"));

    expect(await screen.findByText(/blocking notifications/i)).toBeTruthy();
    // The toggle still reflects intent; the app is intact.
    await waitFor(async () => expect((await getReminderConfig(db)).enabled).toBe(true));
  });

  it("persists a chosen reminder time", async () => {
    const db = await makeReadyDb();
    await setReminderEnabled(db, true); // time input shows only when enabled
    renderSettings(db, fakeNotifier({ granted: true }));

    const time = await screen.findByLabelText("Reminder time");
    fireEvent.change(time, { target: { value: "07:30" } });

    await waitFor(async () => {
      const cfg = await getReminderConfig(db);
      expect(cfg.time).toEqual({ hour: 7, minute: 30 });
    });
  });

  it("shows the saved enabled state and time on load", async () => {
    const db = await makeReadyDb();
    await setReminderEnabled(db, true);
    await setReminderTime(db, 8, 15);
    renderSettings(db, fakeNotifier({ granted: true }));

    expect(((await screen.findByLabelText("Enable reminders")) as HTMLInputElement).checked).toBe(true);
    expect(((await screen.findByLabelText("Reminder time")) as HTMLInputElement).value).toBe("08:15");
  });
});
