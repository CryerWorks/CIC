# Quickstart — Reminders / Notifications (Feature 014)

Live `tauri dev` walkthrough: configure reminders, verify delivery, and confirm the daily nudge fires only when work is waiting and you haven't already shown up. Automated tests cover the pure decision logic, the read-models, the settings UI, and the scheduler tick; this is the human end-to-end check (it touches the real OS notification system).

**Pre-req**: a connected vault with at least one Course that has **due review cards and/or a planned session** (so there's pending work to nudge toward).

---

## A — Set up reminders (US1)
1. Open **Settings → Notifications**. Toggle **Enable reminders** on.
2. **Expect**: the OS prompts for notification permission (first time). Grant it. The toggle shows enabled.
3. Set the **reminder time** to a minute or two from now.

## B — Verify delivery (US1, FR-004)
4. Click **Send test notification**.
5. **Expect**: a native desktop notification appears immediately.

## C — Permission denied path (US1, FR-003/SC-005)
6. (Optional) Deny OS notification permission (or revoke it in OS settings) and toggle enable again.
7. **Expect**: a calm in-app explanation of how to enable OS notifications; the app does **not** crash.

## D — The daily nudge fires when work is waiting (US2, FR-005/006/007)
8. With reminders enabled, permission granted, **pending work present** (due reviews and/or a planned session), and the reminder time set to ~now, leave the app running until the time passes.
9. **Expect**: exactly **one** native notification summarizing what's waiting (e.g. "3 reviews due · 2 sessions planned"). It does **not** fire again later the same day (FR-008).

## E — Catch-up on launch (Assumption)
10. Set the reminder time to a couple of minutes in the past (still today), ensure nothing has been done today and work is pending, then reload the app.
11. **Expect**: a single catch-up notification shortly after launch (still at most once that day).

## F — No nag once you've shown up (US3, FR-010/SC-003)
12. Do one review (or complete one session) so you've practiced today. Set the reminder time to ~now again (and clear today's "last fired" by waiting to the next day, or test on a fresh day).
13. **Expect**: **no** reminder fires — you already showed up.

## G — Nothing pending → silence (FR-006/SC-004)
14. Clear the queue (no due reviews, no planned sessions) and let the reminder time pass.
15. **Expect**: **no** notification.

## H — Persistence (SC-007)
16. Reload the app.
17. **Expect**: the enabled state and reminder time are retained.

## I — Nothing leaked (Constitution I/II, FR-012/SC-006)
18. Confirm that enabling reminders, firing, and the test notification wrote **no** files to the vault and made **no** network requests — notifications are OS-native and local only.
