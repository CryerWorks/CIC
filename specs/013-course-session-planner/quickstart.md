# Quickstart — Course Session Planner (Feature 013)

Live `tauri dev` walkthrough: build a Course into an ordered, milestone-mapped curriculum, then churn through it. Automated tests cover the migration + repo + derivations + the curriculum view; this is the human end-to-end check.

**Pre-req**: a connected vault, one Domain → Course with **2 Milestones**, and ≥1 registered Resource linked to the Course.

---

## A — Plan a few sessions (US1, builds on 012)
1. Open **Courses → your Course**. In the **Sessions** section, **Plan a session** three times (objectives e.g. "Session 1", "Session 2", "Session 3"); give each an assignment.
2. **Expect**: the three sessions appear as an **ordered list** numbered 1–3, in creation order (newest appended to the end).

## B — Sequence the curriculum (US1, FR-002)
3. On "Session 3", click **Move ↑** twice.
4. **Expect**: the order becomes Session 3, Session 1, Session 2; the numbering updates. Reload the app → the order **persists**.
5. **Expect**: Move ↑ is disabled on the first row, Move ↓ on the last.

## C — Map sessions to Milestones (US2, FR-006/010)
6. On each planned session, pick a **Milestone** from the select (limited to this Course's Milestones). Assign two sessions to Milestone A, leave one "— none —".
7. **Expect**: each row shows its Milestone (or "unassigned"); the choice persists across reload.

## D — Coverage (US2, FR-009/SC-003)
8. Look at the **coverage strip**.
9. **Expect**: Milestone A shows 2 sessions; Milestone B shows **0 / uncovered**; one session counted as **unassigned**.

## E — Milestone deletion unmaps, never deletes (edge case, FR-008/SC-007)
10. Edit the Course's Milestones and delete Milestone A.
11. **Expect**: the two sessions that targeted A are **still there**, now showing **unassigned** — no session was lost.

## F — Order is a guide, not a gate (US1, FR-005/SC-004)
12. Open the **Daily Loop**.
13. **Expect**: all three planned sessions are listed and **any** can be started, in any order — the curriculum sequence does not lock or hide later sessions.

## G — Progress through the curriculum (US3, FR-011/012/SC-006)
14. Do one session end-to-end from the Daily Loop (finish it). Return to the Course.
15. **Expect**: that session now shows **done** but keeps its position in the sequence; the Course shows **progress 1 / 3** (a plain count — no "mastered"/"learned" wording).

## H — Nothing leaked to the vault (Constitution I/III, FR-013/SC-005)
16. Confirm that planning, reordering, and milestone-mapping wrote **no** files to the vault and created **no** review cards (only the one session you *did* in step G produced a writeup + cards).

## I — Per-vault isolation (FR-015/SC-008)
17. Switch to a different vault → **Expect**: this Course and its curriculum do **not** appear.
