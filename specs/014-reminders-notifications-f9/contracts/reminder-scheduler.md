# Contract — Reminder scheduling & signals (`src/features/notifications/` + `src/db`)

The fire logic (pure) + the in-app provider that runs it + the read-models it consumes.

## Pure: `decideReminder` (`src/features/notifications/schedule.ts`)

```ts
interface ReminderSignals { dueCount: number; plannedCount: number; practicedToday: boolean; }

export function decideReminder(
  now: Date,
  config: ReminderConfig,                       // from getReminderConfig
  signals: ReminderSignals,
): { title: string; body: string } | null;
```

Returns `{ title, body }` (fire) iff ALL: `config.enabled` · `config.lastFired !== localDay(now)` · `localTime(now) >= config.time` · `dueCount + plannedCount > 0` · `!practicedToday`. Otherwise `null`.

- `body` summarizes pending counts, omitting a zero side: `"3 reviews due · 2 sessions planned"` / `"3 reviews due"` / `"2 sessions planned"` (FR-007). `title` is a fixed calm string (e.g. `"Time to practice"`) — never streak-shaming, never a mastery claim (FR-011/Constitution III).
- **Pure**: no clock, no IO, no permission check (the provider checks permission before calling the notifier).
- **Catch-up** falls out of `>=` (R4): opening the app after `time` on a not-yet-fired day still fires once.

## Config accessors (`src/features/notifications/config.ts`)

`getReminderConfig(db)` / `setReminderEnabled(db, enabled)` / `setReminderTime(db, hour, minute)` / `markReminderFired(db, day)` — over the settings KV (data-model.md). `ReminderConfig` is zod-validated with defaults; never throws on a bad stored value.

## Signal read-models (`src/db`, no schema)

- `countDueCards(db, vaultId, now, cap)` — **existing** (Feature 010); `cap = getNewCardCap(db)`.
- `countPlannedSessions(db, vaultId)` — **NEW** in `sessions.ts`: `COUNT(*)` of the active vault's `status='planned'` sessions (vault join `course → domain`).
- `hasReviewOnDay(db, vaultId, dayPrefix)` — **NEW** in `reviews.ts`: `EXISTS` a review today (vault join `card → course → domain`, `substr(reviewed_at,1,10)=dayPrefix`).
- `hasSessionCompletedOnDay(db, vaultId, dayPrefix)` — **NEW** in `sessions.ts`: `EXISTS` a completed session today.

## Provider/hook: `ReminderScheduler` (`src/features/notifications/ReminderScheduler.tsx`)

A headless component mounted in the app shell (under `DbProvider` + `VaultProvider`, so it has the db + active vault id + notifier). Behavior:

1. On an interval (~60s) and once on mount, run a check.
2. Read `config = getReminderConfig(db)`. If `!config.enabled` → stop. If `await notifier.isPermissionGranted()` is false → stop (the scheduler never prompts; enabling in settings does).
3. Gather `signals` for the active vault (`countDueCards` + `countPlannedSessions`; `hasReviewOnDay || hasSessionCompletedOnDay` for today).
4. `const fire = decideReminder(new Date(), config, signals)`. If null → stop.
5. `await notifier.notify(fire)` then `await markReminderFired(db, localDay(now))`. (Order: persist after a successful notify so a failed notify retries next tick.)

- Renders nothing. Tolerant of no active vault (signals are 0 ⇒ no fire). Never throws into the tree (errors are swallowed/logged — a reminder is best-effort).
- **Injectable seams for tests**: the notifier (via `useNotifier`) and an optional `now`/interval override so a test can drive one tick deterministically.

## Guardrails (surfaced here)

- No vault write, no network, no card mutation anywhere in the scheduler (FR-012). It only **reads** counts and **writes** the `notifications.lastFired` setting.
- Order is never enforced and nothing is marked learned; the reminder is a cadence nudge only (Constitution III).

## Testability

- `schedule.test.ts` (pure): time-not-reached → null; already-fired-today → null; no-pending → null; practiced-today → null; eligible → `{title, body}` with the correct summary (both sides, each single side); catch-up (now past time) → fires.
- Provider test (jsdom, seeded node DB, **fake Notifier**, injected `now`): with pending work + permission granted → one `notify` + `lastFired` written; permission denied → no `notify`; practiced today → no `notify`; second tick same day → no second `notify`.
- New read-models node-adapter tested in `sessions.test.ts` / `reviews.test.ts`.
