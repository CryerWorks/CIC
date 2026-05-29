import type { SchedulingState } from "./schedulingState";

/** The four FSRS grades (the schema's `REVIEW_RATING` enum). Maps 1:1 to ts-fsrs `Rating`. */
export type Grade = "again" | "hard" | "good" | "easy";

export type { SchedulingState };

/** The outcome of grading a card: the next state to persist plus the mirrored columns. */
export interface GradeResult {
  /** New `fsrs_state` to persist. */
  state: SchedulingState;
  /** Next review time → `cards.due_at` (ISO-8601). */
  due: string;
  /** This review's time → `cards.last_reviewed` (ISO-8601). */
  lastReview: string;
}
