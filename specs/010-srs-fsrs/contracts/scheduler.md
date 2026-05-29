# Contract — `Scheduler` (FSRS engine seam)

The deep-module seam (R1). `ts-fsrs` is imported **only** in the implementation; everything else depends on this interface + our domain types. Pure and deterministic given an explicit `now`.

## Types (`src/features/srs/fsrs/types.ts`)

```ts
export type Grade = "again" | "hard" | "good" | "easy"; // = REVIEW_RATING

export interface SchedulingState {
  due: string;            // ISO-8601
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;   // New | Learning | Review | Relearning
  last_review?: string;   // ISO-8601
}

export interface GradeResult {
  state: SchedulingState; // new fsrs_state to persist
  due: string;            // → cards.due_at
  lastReview: string;     // → cards.last_reviewed
}
```

## Interface (`src/features/srs/fsrs/scheduler.ts`)

```ts
export interface Scheduler {
  /** State for a brand-new, never-reviewed card (ts-fsrs empty card seeded at `now`). */
  initial(now?: Date): SchedulingState;

  /** Apply a grade. `prev = null` means a new card (engine seeds an empty card first).
   *  Returns the next state + mirrored due/last-review. Never mutates `prev`. */
  grade(prev: SchedulingState | null, grade: Grade, now?: Date): GradeResult;

  /** Preview the four candidate due dates without committing (for "Again 1m / Good 3d" hints). */
  preview(prev: SchedulingState | null, now?: Date): Record<Grade, string>;
}

export function createScheduler(params?: SchedulerParams): Scheduler; // wraps ts-fsrs fsrs()
```

## Guarantees (tested in `scheduler.test.ts`, runtime-free)

1. **Grade → Rating** maps `again→1, hard→2, good→3, easy→4` (R3).
2. **Monotonicity (SC-002):** for the same `prev` + `now`, `due(again) < due(hard) ≤ due(good) < due(easy)`.
3. **New-card init:** `grade(null, g, now)` equals seeding an empty card at `now` then grading — no NaN/invalid dates.
4. **Determinism:** identical `(prev, grade, now)` ⇒ identical `GradeResult`.
5. **Round-trip:** `GradeResult.state` re-parses through the `SchedulingState` zod schema (persist-safe).
6. **No leak:** no `ts-fsrs` type appears in the interface or any non-impl file (Constitution IV; greppable).

## Consumers

`recordReview` (repo, R12) calls `grade(...)` then persists `state`/`due`/`lastReview` + the review row in one transaction. The review UI calls `preview(...)` for the per-grade interval hints (display only).
