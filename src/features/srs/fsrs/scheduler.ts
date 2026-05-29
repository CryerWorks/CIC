import {
  fsrs,
  createEmptyCard,
  Rating,
  type FSRS,
  type FSRSParameters,
  type Card as FsrsCard,
  type Grade as FsrsGrade,
} from "ts-fsrs";
import type { Grade, GradeResult, SchedulingState } from "./types";

/**
 * The FSRS scheduling engine behind a thin domain seam (Constitution IV — interface-first
 * deep module). **This is the ONLY file that imports `ts-fsrs`** (enforced by ESLint
 * `no-restricted-imports`); the rest of the app depends on `Scheduler` + the domain types
 * `Grade`/`SchedulingState`, never the library's `Rating`/`Card` vocabulary.
 */
export interface Scheduler {
  /** State for a brand-new, never-reviewed card. */
  initial(now?: Date): SchedulingState;
  /** Apply a grade. `prev === null` means a new card (an empty card is seeded first). Pure —
   *  never mutates `prev`; deterministic given `(prev, grade, now)`. */
  grade(prev: SchedulingState | null, grade: Grade, now?: Date): GradeResult;
  /** The four candidate due dates without committing — for the review UI's interval hints. */
  preview(prev: SchedulingState | null, now?: Date): Record<Grade, string>;
}

const RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const GRADES: readonly Grade[] = ["again", "hard", "good", "easy"];

function toFsrsCard(state: SchedulingState): FsrsCard {
  return {
    ...state,
    due: new Date(state.due),
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  } as FsrsCard;
}

function toState(card: FsrsCard): SchedulingState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : undefined,
  };
}

export function createScheduler(params?: Partial<FSRSParameters>): Scheduler {
  const engine: FSRS = fsrs(params);
  const base = (prev: SchedulingState | null, now: Date): FsrsCard =>
    prev ? toFsrsCard(prev) : createEmptyCard(now);

  return {
    initial(now = new Date()): SchedulingState {
      return toState(createEmptyCard(now));
    },
    grade(prev, grade, now = new Date()): GradeResult {
      const { card } = engine.next(base(prev, now), now, RATING[grade]);
      const state = toState(card);
      return { state, due: state.due, lastReview: state.last_review ?? now.toISOString() };
    },
    preview(prev, now = new Date()): Record<Grade, string> {
      const card = base(prev, now);
      const out = {} as Record<Grade, string>;
      for (const g of GRADES) out[g] = engine.next(card, now, RATING[g]).card.due.toISOString();
      return out;
    },
  };
}
