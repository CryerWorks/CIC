# Feature Specification: Reminders / Notifications

**Feature Branch**: `014-reminders-notifications-f9`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Reminders / Notifications (PRD F9) — native OS desktop notifications for due reviews and planned sessions, serving 'consistency over intensity'; configurable daily time, respects 'already logged today', fully local, no AI."

## Overview

CIC rewards showing up daily (spaced retrieval only works if the learner returns). Today nothing reminds them — the work (due review cards, planned sessions) just sits in the app until they happen to open it. This feature adds **native OS notifications** that nudge the learner to practice when work is actually waiting: a configurable daily reminder that fires only if there's something due and only if they haven't already practiced today. It replaces war-room's legacy ICS-file workaround with first-class desktop notifications.

This is **manual, fully local, and AI-free**: notifications are OS-native, reminder settings live in the local key-value store, and the "what's pending" / "already done today" signals come from existing tracking data (SRS reviews, sessions, streaks). Nothing is written to the vault; nothing leaves the machine.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set up and verify reminders (Priority: P1)

A learner opens a notifications setting, turns reminders on, picks a daily time, grants the OS notification permission when prompted, and sends a **test notification** to confirm it actually appears on their desktop — all without waiting for the scheduled time.

**Why this priority**: Configuration + a working permission/test path is the foundation everything else builds on, and it's independently valuable: a learner can confirm "notifications work on my machine" on its own. It is the smallest shippable slice.

**Independent Test**: Open settings, enable reminders, set a time, grant permission, click "Send test notification" → a native notification appears; reload the app → the enabled state and time persist.

**Acceptance Scenarios**:

1. **Given** reminders are off, **When** the learner enables them, **Then** the app requests OS notification permission and the enabled state + chosen time are saved.
2. **Given** reminders are enabled, **When** the learner clicks "Send test notification", **Then** a native notification appears immediately.
3. **Given** the OS denies (or doesn't support) notification permission, **When** the learner enables reminders, **Then** the app explains the situation and how to fix it, and does not crash.
4. **Given** a configured time and enabled state, **When** the app is restarted, **Then** the settings are retained.

---

### User Story 2 - Get reminded when work is waiting (Priority: P2)

While the app is running, at the learner's configured time, they receive a single native notification telling them what's waiting — e.g. "3 reviews due · 2 sessions planned" — so they come back and practice. Clicking it brings the app forward.

**Why this priority**: This is the actual nudge that drives the "show up daily" behavior. It builds on US1's configuration but is independently testable (drive the scheduler at a time with pending work and assert one notification with the right summary).

**Independent Test**: With reminders enabled and pending work present in the active vault, advance to the configured time → exactly one native notification fires summarizing the pending counts; with no pending work, none fires.

**Acceptance Scenarios**:

1. **Given** reminders enabled, permission granted, and pending work (due reviews and/or planned sessions) in the active vault, **When** the configured time arrives while the app runs, **Then** one native notification fires summarizing the pending counts.
2. **Given** the configured time has arrived and a reminder already fired today, **When** time continues to pass, **Then** no further reminder fires that day.
3. **Given** there is no pending work, **When** the configured time arrives, **Then** no notification fires.
4. **Given** a reminder notification, **When** the learner activates it, **Then** the app window is focused/brought forward (best-effort).

---

### User Story 3 - Not nagged once you've shown up (Priority: P3)

If the learner has already practiced today — done a review or completed a session — the daily reminder is suppressed. The app nudges them to start, not to keep going.

**Why this priority**: "Respects already logged today" is what keeps reminders from feeling like nagging (and from undermining the calm, anti-pressure tone the platform requires). It refines US2 but is independently testable.

**Independent Test**: With reminders enabled and pending work, record a review or a completed session dated today, then advance to the configured time → no reminder fires.

**Acceptance Scenarios**:

1. **Given** the learner has already reviewed a card or completed a session today (active vault), **When** the configured time arrives, **Then** no reminder fires.
2. **Given** the learner has not practiced today and work is pending, **When** the configured time arrives, **Then** the reminder fires (US2).

---

### Edge Cases

- **App not running at the configured time**: no reminder fires (MVP fires only while the app is running). If the app is launched later that day with work still pending and nothing done today, a **catch-up** reminder may fire once (see Assumptions).
- **Configured time already passed when the app opens**: treated as the catch-up case above — at most one reminder per local day.
- **OS permission denied / notifications unsupported**: the app explains and points to OS settings; reminders stay effectively inactive until permission is granted. Never crashes.
- **Reminders disabled but a time is set**: nothing fires.
- **Active vault has no pending work / is empty**: no reminder (nothing to nudge toward).
- **Switching the active vault**: the reminder reflects the *current* active vault's pending work and "done today" state.
- **Local clock crossing midnight**: "today" and "already fired today" are evaluated against the local date.

## Requirements *(mandatory)*

### Functional Requirements

**Configuration & permission (US1)**

- **FR-001**: Users MUST be able to enable or disable daily reminders, and the choice MUST persist locally across app restarts.
- **FR-002**: Users MUST be able to set a daily reminder time (hour and minute), persisted locally.
- **FR-003**: The system MUST request OS notification permission when reminders are enabled, and MUST handle a denied or unsupported permission gracefully (clear explanation, guidance to OS settings, no crash).
- **FR-004**: Users MUST be able to trigger a **test notification** on demand that appears immediately, to verify permission and delivery.

**Daily reminder (US2)**

- **FR-005**: While the app is running and reminders are enabled with permission granted, the system MUST fire a native notification at the configured time.
- **FR-006**: The reminder MUST fire only when there is pending work for the **active vault** — due review cards and/or planned sessions; with nothing pending, no notification fires.
- **FR-007**: The reminder notification MUST summarize the pending work (counts of due reviews and/or planned sessions).
- **FR-008**: The system MUST fire **at most one** scheduled reminder per local day (no repeat firing once it has fired that day).
- **FR-009**: Activating the reminder notification SHOULD bring the app to the foreground (best-effort, per OS support).

**Suppression (US3)**

- **FR-010**: The system MUST suppress the daily reminder if the learner has already practiced today in the active vault (a review recorded today or a session completed today).

**Scope & guardrails**

- **FR-011**: Reminders MUST nudge cadence only — they MUST NOT reveal answers, mark anything as learned/mastered, or apply pressure beyond prompting the learner to practice (no streak-shaming).
- **FR-012**: The feature MUST be fully local: OS-native notifications only, no remote push, no analytics/telemetry, and **no vault writes**.
- **FR-013**: Reminder evaluation MUST be scoped to the active vault's pending work and activity (consistent with existing per-vault data scoping).
- **FR-014**: The feature MUST function with no AI provider configured.

### Key Entities *(include if feature involves data)*

- **Reminder configuration** (stored, local): whether reminders are enabled, the daily time (hour/minute), and bookkeeping for "last fired" so it fires at most once per day. Lives in the existing local settings store; not in the vault.
- **Pending work** (derived, not stored): the active vault's due review count and planned-session count — the signal that a reminder is warranted.
- **"Practiced today" signal** (derived, not stored): whether any review was recorded or any session completed today in the active vault — the suppression signal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner can enable reminders, set a time, grant permission, and see a test notification appear — confirming setup — in under one minute.
- **SC-002**: With reminders enabled and work pending, the learner receives **exactly one** native reminder at the configured time per day while the app runs.
- **SC-003**: If the learner has already practiced today, **no** reminder fires.
- **SC-004**: If there is no pending work, **no** reminder fires.
- **SC-005**: Denying or lacking OS notification permission never crashes the app; the learner sees a clear explanation and can retry after adjusting OS settings.
- **SC-006**: No reminder-related activity produces any vault write or any network request.
- **SC-007**: Reminder configuration (enabled state + time) survives an app restart.
- **SC-008**: Reminders reflect only the active vault's pending work and activity; switching vaults switches the basis accordingly.

## Assumptions

- **Foreground-only for v1**: reminders fire only while the app is running. True OS-level background scheduling when the app is closed (autostart / background daemon) is out of scope (see below) and deferred to a later iteration.
- **Catch-up fire**: if the app is opened (or has been running) past the configured time on a day when work is pending and nothing has been done today and no reminder has fired yet that day, a single catch-up reminder fires. This favors "you still got nudged" over silence, while preserving the at-most-once-per-day rule (FR-008).
- **"Pending work" = either signal**: due reviews **or** planned sessions count as pending; the reminder fires if either is non-zero.
- **"Practiced today" = either signal**: a review recorded today **or** a session completed today counts as having shown up.
- **Single daily reminder**: one configurable time, one notification per day for v1 (no per-type schedules, no snooze, no multiple reminders).
- **Reuses existing data**: the SRS due-queue (Feature 010), planned sessions (Features 012/013), and review/session/streak activity provide the pending-work and practiced-today signals; reminder config uses the Feature-006 settings store.
- **Local date basis**: "today" and "fired today" are evaluated against the machine's local date.

## Out of Scope

- True OS-level **background scheduling when the app is closed** (autostart, background process, OS task scheduler) — v1 fires only while the app runs.
- Per-notification-type schedules, **snooze**, and multiple daily reminders.
- Mobile notifications.
- AI-chosen reminder timing or AI-composed reminder text.
- The F6 interleaving scheduler's "what to do next / daily-mix" suggestion (this feature only nudges the learner to come back; it does not decide what they study).
- In-app (non-OS) toast/banner reminders.
