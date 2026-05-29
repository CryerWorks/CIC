import type { Migration } from "../migrate";

/**
 * Feature 013 (Course Session Planner) — the course-level curriculum layer on top of 012.
 * Additive only (research R1), schema 6 → 7:
 *
 * - `sessions.milestone_id` — the Course Milestone this session advances (optional). `ON DELETE
 *   SET NULL` so deleting a Milestone **unmaps** its sessions rather than deleting them (R3/FR-008);
 *   Milestones are user-editable (Feature 007 `syncCourseMilestones` deletes removed ones), and a
 *   NO-ACTION FK would make that fail when a session still points at the removed Milestone. The FK
 *   only guarantees a *valid* milestone id — the same-Course constraint is enforced in the UI (R3).
 *   Resolves the §8 `sessions.milestone_id` gap deliberately deferred in Features 010/012.
 * - `sessions.order_index` — position within the Course's sequence (R2). `NOT NULL DEFAULT 0` so
 *   pre-feature rows back-fill to 0 and sort by the `(order_index, date, id)` tiebreak until the
 *   user reorders. `reorderCourseSessions` keeps the set contiguous `0..N-1` per Course.
 *
 * No table rebuild — safe under the idempotent, transaction-wrapped runner and the pooled adapter
 * (`ADD COLUMN` is guarded by `columnExists` + the Feature-012 "duplicate column name" self-heal;
 * the INDEX uses `IF NOT EXISTS`). The `ON DELETE SET NULL` action fires at runtime because FK
 * enforcement is ON in both adapters (node sets `PRAGMA foreign_keys=ON`; sqlx defaults ON), as the
 * 011 `resources.domain_id` precedent already relies on. IMMUTABLE once shipped.
 */
export const m0007SessionCurriculum: Migration = {
  version: 7,
  name: "session_curriculum",
  sql: `
ALTER TABLE sessions ADD COLUMN milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_milestone_id ON sessions(milestone_id);
`.trim(),
};
