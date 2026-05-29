import type { ReminderConfig } from "./config";

/**
 * The pure reminder-fire decision (Feature 014, R4). Given `now`, the config, and the derived
 * signals, decide whether to fire and with what text — no clock, no IO, no permission check (the
 * provider checks permission before calling the notifier). All the rules live here so they are
 * unit-testable in isolation.
 */
export interface ReminderSignals {
  dueCount: number;
  plannedCount: number;
  practicedToday: boolean;
}

/** The `YYYY-MM-DD` calendar-date key for `d` — the basis for "today", the once-per-day rule, and
 *  the practiced-today suppression. Uses the **UTC** date to match the stored `reviewed_at` /
 *  `completed_at` timestamps (UTC ISO) and the SRS daily-cap convention in `cards.ts`, so
 *  `lastFired` and the activity checks share one basis (avoids a local-vs-UTC midnight mismatch). */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "3 reviews due · 2 sessions planned", omitting a zero side (FR-007). */
function summarize(dueCount: number, plannedCount: number): string {
  const parts: string[] = [];
  if (dueCount > 0) parts.push(`${dueCount} review${dueCount === 1 ? "" : "s"} due`);
  if (plannedCount > 0) parts.push(`${plannedCount} session${plannedCount === 1 ? "" : "s"} planned`);
  return parts.join(" · ");
}

/**
 * Returns `{ title, body }` to fire, or `null`. Fires iff: enabled · not already fired today ·
 * `now` is at/after the configured time (`>=` gives catch-up) · there is pending work · the learner
 * hasn't practiced today. The copy is a calm cadence nudge — never a mastery claim (Constitution III).
 */
export function decideReminder(
  now: Date,
  config: ReminderConfig,
  signals: ReminderSignals,
): { title: string; body: string } | null {
  if (!config.enabled) return null;
  if (config.lastFired === dayKey(now)) return null;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = config.time.hour * 60 + config.time.minute;
  if (nowMinutes < targetMinutes) return null;

  if (signals.dueCount + signals.plannedCount <= 0) return null;
  if (signals.practicedToday) return null;

  return { title: "Time to practice", body: summarize(signals.dueCount, signals.plannedCount) };
}
