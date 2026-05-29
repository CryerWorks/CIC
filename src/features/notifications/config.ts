import { z } from "zod";
import { getSetting, setSetting, type SqlExecutor } from "../../db";

/**
 * Reminder configuration over the Feature-006 settings key-value store (Feature 014). Three scalars
 * — no migration, no new table (research R3). Mirrors the `getNewCardCap` accessor pattern: a bad or
 * missing stored value falls back to its default and never throws (Constitution: never crash on a
 * bad stored shape).
 */
export const ENABLED_KEY = "notifications.enabled";
export const TIME_KEY = "notifications.time";
export const LAST_FIRED_KEY = "notifications.lastFired";

export const DEFAULT_TIME = { hour: 9, minute: 0 } as const;

export interface ReminderConfig {
  enabled: boolean;
  time: { hour: number; minute: number };
  /** Local `YYYY-MM-DD` of the last fired reminder — a single GLOBAL key (once/day across vaults,
   *  FR-008); only the pending/practiced signals are per-vault. Null = never fired. */
  lastFired: string | null;
}

const timeSchema = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/)
  .transform((s) => {
    const [h, m] = s.split(":").map((p) => Number.parseInt(p, 10));
    return { hour: h, minute: m };
  })
  .refine((t) => t.hour >= 0 && t.hour <= 23 && t.minute >= 0 && t.minute <= 59);

function parseTime(raw: string | null): { hour: number; minute: number } {
  if (raw === null) return { ...DEFAULT_TIME };
  const parsed = timeSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_TIME };
}

/** Read the reminder config, applying defaults for missing/malformed values. */
export async function getReminderConfig(db: SqlExecutor): Promise<ReminderConfig> {
  const [enabledRaw, timeRaw, lastFired] = await Promise.all([
    getSetting(db, ENABLED_KEY),
    getSetting(db, TIME_KEY),
    getSetting(db, LAST_FIRED_KEY),
  ]);
  return {
    enabled: enabledRaw === "true",
    time: parseTime(timeRaw),
    lastFired: lastFired,
  };
}

export async function setReminderEnabled(db: SqlExecutor, enabled: boolean): Promise<void> {
  await setSetting(db, ENABLED_KEY, enabled ? "true" : "false");
}

/** Persist the daily time as zero-padded `HH:MM`. */
export async function setReminderTime(db: SqlExecutor, hour: number, minute: number): Promise<void> {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  await setSetting(db, TIME_KEY, `${hh}:${mm}`);
}

export async function markReminderFired(db: SqlExecutor, day: string): Promise<void> {
  await setSetting(db, LAST_FIRED_KEY, day);
}
