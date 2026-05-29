import { useEffect, useRef } from "react";
import { useDbState } from "../../app/providers/DbProvider";
import { useActiveVaultId } from "../../app/providers/VaultProvider";
import { useNotifier } from "../../notifications/NotifierProvider";
import {
  getNewCardCap,
  countDueCards,
  countPlannedSessions,
  hasReviewOnDay,
  hasSessionCompletedOnDay,
} from "../../db";
import { getReminderConfig, markReminderFired } from "./config";
import { decideReminder, dayKey } from "./schedule";

/**
 * The app-wide reminder scheduler (Feature 014, US2/US3). Headless: mounted once at the composition
 * root (`main.tsx`), it checks on mount and on an interval whether to fire a native reminder for the
 * active vault. It only **reads** counts + activity and **writes** the `notifications.lastFired`
 * setting — no vault write, no card mutation (no `VaultWriter` dependency). The fire decision is the
 * pure `decideReminder`; the OS touch is via the injected `Notifier` seam.
 *
 * Reads `useDbState()` (not `useDb()`) so it sits safely above the store-ready gate — it bails until
 * the store is ready and re-arms when the store or active vault changes. `now`/`intervalMs` are
 * overridable so a test can drive a deterministic check.
 */
export function ReminderScheduler({
  now = () => new Date(),
  intervalMs = 60_000,
}: {
  now?: () => Date;
  intervalMs?: number;
}) {
  const dbState = useDbState();
  const db = dbState.status === "ready" ? dbState.db : null;
  const vaultId = useActiveVaultId() ?? "";
  const notifier = useNotifier();

  // Keep `notifier`/`now` in a ref so they don't re-arm the interval each render; `db`/`vaultId`
  // are effect deps so a check runs once they (and the active vault) become available.
  const stable = useRef({ notifier, now });
  stable.current = { notifier, now };

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    const check = async () => {
      const { notifier, now } = stable.current;
      try {
        const config = await getReminderConfig(db);
        if (!config.enabled) return;
        if (!(await notifier.isPermissionGranted())) return;

        const at = now();
        const day = dayKey(at);
        const cap = await getNewCardCap(db);
        const [dueCount, plannedCount, reviewedToday, sessionToday] = await Promise.all([
          countDueCards(db, vaultId, at.toISOString(), cap),
          countPlannedSessions(db, vaultId),
          hasReviewOnDay(db, vaultId, day),
          hasSessionCompletedOnDay(db, vaultId, day),
        ]);

        const fire = decideReminder(at, config, {
          dueCount,
          plannedCount,
          practicedToday: reviewedToday || sessionToday,
        });
        if (!fire || cancelled) return;

        await notifier.notify(fire);
        await markReminderFired(db, day);
      } catch {
        // Best-effort: a reminder must never crash the app or the render tree.
      }
    };

    void check();
    const id = setInterval(() => void check(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [db, vaultId, intervalMs]);

  return null;
}
