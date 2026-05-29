# Data Model — Reminders / Notifications (Feature 014)

**No migration. No new table.** Reminder config is three values in the existing settings key-value store (Feature 006); the pending-work and practiced-today signals are **derived** at evaluation time from existing tables. Latest schema version stays **7** (Feature 013's `m0007`).

---

## Stored: reminder config (settings KV)

| Key | Value | Notes |
|---|---|---|
| `notifications.enabled` | `"true"` / `"false"` | reminders on/off (FR-001). Absent ⇒ off (default). |
| `notifications.time` | `"HH:MM"` (24h, zero-padded) | daily reminder time (FR-002). Absent ⇒ a sensible default (e.g. `"09:00"`). |
| `notifications.lastFired` | `"YYYY-MM-DD"` (local date) | the last local day a reminder fired — enforces at-most-once-per-day (FR-008). Absent ⇒ never fired. |

Accessor (mirrors `getNewCardCap` in `cards.ts`), in `src/features/notifications/config.ts`:

```ts
interface ReminderConfig {
  enabled: boolean;
  time: { hour: number; minute: number }; // parsed from "HH:MM"
  lastFired: string | null;               // "YYYY-MM-DD"
}
getReminderConfig(db): Promise<ReminderConfig>           // reads + parses the three keys (zod), defaults applied
setReminderEnabled(db, enabled): Promise<void>
setReminderTime(db, hour, minute): Promise<void>
markReminderFired(db, day): Promise<void>                // writes notifications.lastFired = day
```

`ReminderConfig` is validated through a small zod schema; a malformed/missing value falls back to its default (never throws — Constitution "never crash on bad stored shape").

---

## Derived (not stored) — evaluated per check

### Pending work (the "is a nudge warranted?" signal — FR-006/FR-007)

- **Due reviews**: `countDueCards(db, vaultId, now, cap)` (Feature 010; `cap = getNewCardCap(db)`).
- **Planned sessions**: `countPlannedSessions(db, vaultId)` — **NEW** cheap `COUNT(*)` over the active vault's planned sessions (added to `sessions.ts`; mirrors the existing `listPlannedSessions` vault join).
- `pending = dueCount + plannedCount`; a reminder is warranted iff `pending > 0`.

### Practiced today (the suppression signal — FR-010)

- **Reviewed today**: `hasReviewOnDay(db, vaultId, dayPrefix)` — **NEW** in `reviews.ts`: `EXISTS` a `reviews` row (vault-joined `card → course → domain`) whose `substr(reviewed_at,1,10) = dayPrefix`.
- **Session completed today**: `hasSessionCompletedOnDay(db, vaultId, dayPrefix)` — **NEW** in `sessions.ts`: `EXISTS` a `sessions` row (vault-joined `course → domain`) with `status='completed'` and `substr(completed_at,1,10) = dayPrefix`.
- `practicedToday = reviewedToday || sessionCompletedToday`.

All vault-scoped transitively (no new `vault_id` columns) — consistent with Features 009–013.

---

## Decision input (the pure function — R4)

```ts
interface ReminderSignals { dueCount: number; plannedCount: number; practicedToday: boolean; }

decideReminder(
  now: Date,                 // local
  config: ReminderConfig,
  signals: ReminderSignals,
): { title: string; body: string } | null;
```

Returns non-null (fire) **iff** all hold:
1. `config.enabled`
2. `config.lastFired !== <local YYYY-MM-DD of now>` (not already fired today — FR-008)
3. `now`'s local time `>= config.time` (time reached; `>=` gives catch-up — R4)
4. `signals.dueCount + signals.plannedCount > 0` (pending — FR-006)
5. `!signals.practicedToday` (not already shown up — FR-010)

The `body` summarizes counts, e.g. `"3 reviews due · 2 sessions planned"` (omit a zero side; FR-007). Permission state is checked by the provider before calling the notifier (not part of the pure function).

---

## Validation & invariants

- `notifications.time` always parses to a valid `0–23` hour / `0–59` minute; a bad stored value falls back to the default (no crash).
- `markReminderFired` writes the **local** date so the once-per-day rule and "today" comparisons share one basis (Assumption: local date).
- No vault writes, no network, no AI anywhere in this feature (FR-012/FR-014).
- Signals are read-only over existing tables; this feature adds **no** writable schema.
