# Research — Course Session Planner (Feature 013)

Phase 0 decisions. Each: **Decision · Rationale · Alternatives rejected.**

---

## R1 — One additive migration (`m0007`), schema 6 → 7

**Decision**: Add `m0007_session_curriculum`: `sessions.milestone_id` (nullable `TEXT REFERENCES milestones(id) ON DELETE SET NULL`) and `sessions.order_index` (`INTEGER NOT NULL DEFAULT 0`), plus an index on `milestone_id`.

**Rationale**: The course-level curriculum needs two things the §8 `sessions` schema lacks: a **position within the Course** and an **optional Milestone link**. The `sessions.milestone_id` gap was *deliberately deferred* in Features 010 and 012 ("a future schema decision") because nothing yet needed it; the curriculum's milestone-coverage view is the genuine need that resolves it. Both columns are additive — no table rebuild — safe under the idempotent, transaction-wrapped runner and the pooled production adapter (the `ADD COLUMN` self-heal hardened in Feature 012 covers a partial apply).

**Alternatives rejected**:
- *A separate `session_order` / `session_milestones` table* — over-normalized for a strictly 1:1 (order) and 0..1 (milestone) relationship; two columns on `sessions` are simpler and match the existing `cards`/`resources` additive-column precedent.
- *Continue deferring `milestone_id`* — there is now a real consumer (coverage); deferring would force a worse proxy (e.g., parsing the objective).

---

## R2 — Ordering is a normalized 0..N-1 per Course

**Decision**: `reorderCourseSessions(db, courseId, orderedIds)` rewrites `order_index = position` for *every* session of the Course in one transaction. The UI holds the ordered list, swaps two entries for a move ↑/↓, and calls it. Listing sorts by `(order_index, date, id)`.

**Rationale**: Rewriting the whole course's indices on every reorder makes duplicate positions impossible by construction (FR-004) and keeps the move operation trivial and idempotent. The `(order_index, date, id)` tiebreak means pre-feature rows (all `order_index = 0` from the migration default) and any transient tie still render in a stable, deterministic order until the user reorders. A Course has tens of sessions at most, so a full-course rewrite is cheap.

**Alternatives rejected**:
- *Server-side `moveSession(id, "up"|"down")` that swaps two indices* — leaves the rest of the course's indices unnormalized and can preserve duplicate positions from the migration default; the array-rewrite is more robust and equally simple.
- *Fractional/gap indices (e.g., 10, 20, 30)* — avoids rewrites but adds rebalancing complexity for no benefit at this scale.

---

## R3 — `milestone_id` is `ON DELETE SET NULL`; same-course enforced in the app

**Decision**: The FK is `ON DELETE SET NULL`. The Milestone picker is limited to the session's own Course's Milestones in the UI/validation.

**Rationale**: Deleting a Milestone must **unmap** its sessions, never delete or block them (FR-008) — Milestones are user-editable (Feature 007's `MilestonesEditor`/`syncCourseMilestones` deletes removed ones), and a NO-ACTION FK would make milestone edits fail when sessions point at a removed milestone. The FK can only guarantee a *valid* milestone id, not a *same-course* one; restricting the picker to the Course's milestones (FR-010) enforces the semantic constraint where it belongs.

**Alternatives rejected**:
- *`ON DELETE CASCADE`* — would delete sessions when a milestone is removed; catastrophic data loss for a guide-level association.
- *A CHECK/trigger enforcing same-course* — SQLite can't express a cross-row FK constraint cleanly; app-level validation is the idiomatic choice here.

---

## R4 — Coverage and progress are derived, not stored

**Decision**: Compute coverage (sessions-per-Milestone, uncovered Milestones) and progress (completed / total) in `useCoursePlans` from `listCourseSessions(courseId)` + `listMilestonesByCourse(courseId)`. No stored counters.

**Rationale**: Both are pure aggregations over a small, already-loaded set. Storing counters would introduce drift (every plan/reorder/finish would have to maintain them) for zero benefit. Deriving keeps a single source of truth (the session rows) and is trivially unit-testable.

**Alternatives rejected**:
- *Denormalized `milestones.session_count`* — drift risk; another thing to keep consistent on session create/delete/finish/remap.

---

## R5 — `planSession` appends order + accepts an optional Milestone

**Decision**: `planSession` (Feature 012) gains: it computes `order_index = COALESCE(MAX(order_index), -1) + 1` for the Course, and accepts an optional `milestoneId` written onto the row. Existing planning behavior is otherwise unchanged.

**Rationale**: New sessions should land at the end of the sequence (FR-003) and can be milestone-tagged at creation (the planner already knows the Course's milestones — Feature 012 loads them for the objective seed). This keeps a single create path rather than a create-then-reorder dance.

**Alternatives rejected**:
- *Insert at order 0 / require an explicit position* — append-to-end is the least surprising default; the user reorders afterward.

---

## R6 — The curriculum shows ALL of a Course's sessions; the Daily Loop is untouched

**Decision**: The Course-detail "Sessions" section lists **all** the Course's sessions (planned + completed) ordered by the sequence; planned rows carry move/assign/delete controls, completed rows render as "done". The Daily Loop "do" surface is unchanged and does **not** enforce order (FR-005).

**Rationale**: A curriculum reads as a path you progress through, so completed sessions keep their place (US3 progress). Putting the controls only on planned rows matches what's editable. Leaving the Daily Loop unordered preserves desirable difficulty (the sequence guides, it doesn't gate) and avoids touching the working 012 doing-flow.

**Alternatives rejected**:
- *Show only planned sessions in the curriculum* — loses the progress narrative (US3) and makes a half-done course look empty.
- *Enforce the order at do-time (lock later sessions)* — explicitly out of scope and a Constitution III smell (gating hides material).
