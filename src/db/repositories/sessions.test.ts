// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import { createMilestone, deleteMilestone } from "./milestones";
import { registerResource } from "./resources";
import { listCardsByCourse } from "./cards";
import { listCardResources } from "./cardResources";
import { insert } from "./query";
import {
  planSession,
  finalizeSession,
  listPlannedSessions,
  listPlannedSessionsByCourse,
  listSessionsByVault,
  listCourseSessions,
  countPlannedSessions,
  hasSessionCompletedOnDay,
  reorderCourseSessions,
  setSessionMilestone,
  getSession,
  listSessionAssignments,
  listPretestResponses,
  listSessionCardDrafts,
  deletePlannedSession,
} from "./sessions";

const VID = "vault-1";

async function freshDb(): Promise<NodeSqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/vault" });
  return db;
}

async function seedCourse(db: NodeSqlExecutor, vaultId = VID) {
  const d = await createDomain(db, vaultId, { name: `Math-${vaultId}`, color: "#8b6cef" });
  const c = await createCourse(db, { title: "Real Analysis", domainId: d.id });
  return c.id;
}

describe("sessions repo — planSession (Feature 012, two-phase)", () => {
  it("persists a PLANNED session with its assignments, pretest questions, and card drafts; no cards, no completion", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const res = await registerResource(db, VID, { title: "Baby Rudin", kind: "pdf" });

    const session = await planSession(db, {
      courseId,
      objective: "State the epsilon-delta definition of a limit",
      assignments: [{ resourceId: res.id, locator: "page=10", kind: "read" }],
      pretestQuestions: ["What is a limit?", "Why epsilon-delta?"],
      cardDrafts: [{ front: "Define a limit", back: "" }],
    });

    expect(session.status).toBe("planned");
    expect(session.completed_at).toBeNull();
    expect(session.writeup_path).toBeNull();

    // No review cards created at plan time.
    expect(await listCardsByCourse(db, courseId)).toHaveLength(0);

    // Children persisted.
    const assignments = await listSessionAssignments(db, session.id);
    expect(assignments.map((a) => [a.resource_id, a.locator, a.assignment_kind])).toEqual([
      [res.id, "page=10", "read"],
    ]);
    const pretest = await listPretestResponses(db, session.id);
    expect(pretest.map((p) => p.question)).toEqual(["What is a limit?", "Why epsilon-delta?"]);
    expect(pretest.every((p) => p.user_response === null)).toBe(true); // answered while doing
    const drafts = await listSessionCardDrafts(db, session.id);
    expect(drafts.map((d) => d.front)).toEqual(["Define a limit"]);

    // Surfaces in the planned lists (vault + course), not as completed.
    expect((await listPlannedSessions(db, VID)).map((s) => s.session.id)).toEqual([session.id]);
    expect((await listPlannedSessionsByCourse(db, courseId)).map((s) => s.id)).toEqual([session.id]);
    expect(await listSessionsByVault(db, VID, { status: "completed" })).toHaveLength(0);
  });
});

describe("sessions repo — finalizeSession (Feature 012, two-phase)", () => {
  it("flips the session to COMPLETED, records pretest answers, materializes drafts as new cited cards, removes drafts", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const res = await registerResource(db, VID, { title: "Baby Rudin", kind: "pdf" });

    const planned = await planSession(db, {
      courseId,
      objective: "Limits",
      assignments: [{ resourceId: res.id, locator: "page=10", kind: "read" }],
      pretestQuestions: ["What is a limit?"],
      cardDrafts: [{ front: "Define a limit", back: "" }],
    });
    const pretestRows = await listPretestResponses(db, planned.id);

    const completed = await finalizeSession(db, {
      sessionId: planned.id,
      minutes: 25,
      didRetrieval: true,
      writeupPath: "Sessions/2026-05-29 limits (abcd1234).md",
      pretestAnswers: [{ id: pretestRows[0].id, userResponse: "a guess", revealedAfter: false }],
      cards: [{ front: "Define a limit", back: "epsilon-delta" }],
    });

    expect(completed.status).toBe("completed");
    expect(completed.minutes).toBe(25);
    expect(completed.did_retrieval).toBe(true);
    expect(completed.completed_at).not.toBeNull();
    expect(completed.writeup_path).toBe("Sessions/2026-05-29 limits (abcd1234).md");

    // Pretest answer recorded verbatim, never graded.
    const pretest = await listPretestResponses(db, planned.id);
    expect(pretest[0].user_response).toBe("a guess");

    // Drafts materialized into a new, cited card; drafts removed.
    expect(await listSessionCardDrafts(db, planned.id)).toHaveLength(0);
    const cards = await listCardsByCourse(db, courseId);
    expect(cards).toHaveLength(1);
    expect(cards[0].fsrs_state).toBeNull(); // new — never pre-scheduled (FR-022)
    const cites = await listCardResources(db, cards[0].id);
    expect(cites.map((c) => [c.resource.id, c.locator])).toEqual([[res.id, "page=10"]]);

    // Now appears as completed (not planned).
    expect(await listPlannedSessions(db, VID)).toHaveLength(0);
    expect((await listSessionsByVault(db, VID, { status: "completed" })).map((s) => s.session.id)).toEqual([
      planned.id,
    ]);
  });

  it("dedupes card citations by resource (first locator wins) — finding D1", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const res = await registerResource(db, VID, { title: "Baby Rudin", kind: "pdf" });

    const planned = await planSession(db, {
      courseId,
      objective: "Limits",
      // two assignments share ONE resource (different locators)
      assignments: [
        { resourceId: res.id, locator: "page=10", kind: "read" },
        { resourceId: res.id, locator: "page=20", kind: "review" },
      ],
      pretestQuestions: [],
      cardDrafts: [{ front: "Q", back: "A" }],
    });

    await finalizeSession(db, {
      sessionId: planned.id,
      minutes: 5,
      didRetrieval: false,
      writeupPath: null,
      pretestAnswers: [],
      cards: [{ front: "Q", back: "A" }],
    });

    const cards = await listCardsByCourse(db, courseId);
    const cites = await listCardResources(db, cards[0].id);
    expect(cites).toHaveLength(1); // one row, not a PK collision
    expect(cites[0].locator).toBe("page=10"); // first wins
  });

  it("scopes planned and completed sessions to the active vault", async () => {
    const db = await freshDb();
    const courseA = await seedCourse(db, VID);
    await attachVault(db, { id: "vault-2", path: "/v2" });
    const courseB = await seedCourse(db, "vault-2");

    const a = await planSession(db, { courseId: courseA, objective: "A", assignments: [], pretestQuestions: [], cardDrafts: [] });
    await planSession(db, { courseId: courseB, objective: "B", assignments: [], pretestQuestions: [], cardDrafts: [] });
    await finalizeSession(db, { sessionId: a.id, minutes: 1, didRetrieval: false, writeupPath: null, pretestAnswers: [], cards: [] });

    expect((await listSessionsByVault(db, VID)).map((s) => s.session.objective)).toEqual(["A"]);
    expect((await listSessionsByVault(db, "vault-2")).map((s) => s.session.objective)).toEqual(["B"]);
    expect((await listPlannedSessions(db, "vault-2")).map((s) => s.session.objective)).toEqual(["B"]);
    expect(await listPlannedSessions(db, VID)).toHaveLength(0); // A is completed
  });

  it("deletePlannedSession removes a plan + children but refuses a completed session", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const res = await registerResource(db, VID, { title: "R", kind: "pdf" });

    const plan = await planSession(db, {
      courseId,
      objective: "throwaway",
      assignments: [{ resourceId: res.id, locator: null, kind: "read" }],
      pretestQuestions: ["q"],
      cardDrafts: [{ front: "f", back: "b" }],
    });
    await deletePlannedSession(db, plan.id);
    expect(await getSession(db, plan.id)).toBeNull();
    expect(await listSessionAssignments(db, plan.id)).toHaveLength(0); // cascade
    expect(await listSessionCardDrafts(db, plan.id)).toHaveLength(0);

    const done = await planSession(db, { courseId, objective: "keep", assignments: [], pretestQuestions: [], cardDrafts: [] });
    await finalizeSession(db, { sessionId: done.id, minutes: 1, didRetrieval: false, writeupPath: null, pretestAnswers: [], cards: [] });
    await deletePlannedSession(db, done.id); // no-op for a completed session
    expect(await getSession(db, done.id)).not.toBeNull();
  });
});

const plan = (db: NodeSqlExecutor, courseId: string, objective: string) =>
  planSession(db, { courseId, objective, assignments: [], pretestQuestions: [], cardDrafts: [] });

describe("sessions repo — ordering (Feature 013, US1)", () => {
  it("planSession appends order_index = MAX+1 per Course (first → 0); separate Courses count independently", async () => {
    const db = await freshDb();
    const courseA = await seedCourse(db);
    const a0 = await plan(db, courseA, "A0");
    const a1 = await plan(db, courseA, "A1");
    const a2 = await plan(db, courseA, "A2");
    expect([a0.order_index, a1.order_index, a2.order_index]).toEqual([0, 1, 2]);

    // A second Course's sequence starts at 0 again (course-scoped MAX).
    const d = await createDomain(db, VID, { name: "Physics", color: "#00bfbc" });
    const courseB = (await createCourse(db, { title: "Mechanics", domainId: d.id })).id;
    const b0 = await plan(db, courseB, "B0");
    expect(b0.order_index).toBe(0);
  });

  it("listCourseSessions returns ALL of a Course's sessions (planned + completed) in (order_index, date, id) order", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const s0 = await plan(db, courseId, "first");
    const s1 = await plan(db, courseId, "second");
    await finalizeSession(db, { sessionId: s0.id, minutes: 1, didRetrieval: false, writeupPath: null, pretestAnswers: [], cards: [] });

    // Completed sessions keep their place — listed alongside planned, by order_index.
    const seq = await listCourseSessions(db, courseId);
    expect(seq.map((s) => s.id)).toEqual([s0.id, s1.id]);
    expect(seq.map((s) => s.status)).toEqual(["completed", "planned"]);
  });

  it("breaks an order_index tie deterministically by (date, id) — pre-feature/back-filled rows", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    // Two rows sharing order_index = 0 (the migration back-fill case): older date sorts first.
    const older = {
      id: "id-older", course_id: courseId, project_id: null, date: "2026-01-01T00:00:00.000Z",
      objective: "older", minutes: 0, did_retrieval: 0, writeup_path: null,
      status: "planned", completed_at: null, milestone_id: null, order_index: 0,
    };
    const newer = { ...older, id: "id-newer", date: "2026-02-01T00:00:00.000Z", objective: "newer" };
    await insert(db, "sessions", newer); // insert newer first to prove sort, not insertion order
    await insert(db, "sessions", older);

    expect((await listCourseSessions(db, courseId)).map((s) => s.objective)).toEqual(["older", "newer"]);
  });

  it("reorderCourseSessions rewrites a contiguous 0..N-1 (no duplicate positions), idempotently, ignoring foreign ids", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const s0 = await plan(db, courseId, "s0");
    const s1 = await plan(db, courseId, "s1");
    const s2 = await plan(db, courseId, "s2");

    // Move s2 to the front (a move ↑↑ in the UI): caller passes the full new ordering.
    await reorderCourseSessions(db, courseId, [s2.id, s0.id, s1.id]);
    let seq = await listCourseSessions(db, courseId);
    expect(seq.map((s) => s.id)).toEqual([s2.id, s0.id, s1.id]);
    expect(seq.map((s) => s.order_index)).toEqual([0, 1, 2]); // contiguous, no dupes

    // Idempotent — re-applying the same order is a no-op-equivalent rewrite.
    await reorderCourseSessions(db, courseId, [s2.id, s0.id, s1.id]);
    expect((await listCourseSessions(db, courseId)).map((s) => s.id)).toEqual([s2.id, s0.id, s1.id]);

    // Ids not belonging to the Course are ignored (no crash, no effect on positions).
    await reorderCourseSessions(db, courseId, [s2.id, s0.id, s1.id, "not-a-session"]);
    seq = await listCourseSessions(db, courseId);
    expect(seq.map((s) => s.order_index)).toEqual([0, 1, 2]);
  });
});

describe("sessions repo — milestone mapping (Feature 013, US2)", () => {
  it("planSession accepts an optional milestoneId; setSessionMilestone sets and clears it", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const m = await createMilestone(db, { courseId, capability: "Derive the chain rule", orderIndex: 0 });

    // Tagged at creation.
    const tagged = await planSession(db, {
      courseId, objective: "tagged", milestoneId: m.id, assignments: [], pretestQuestions: [], cardDrafts: [],
    });
    expect(tagged.milestone_id).toBe(m.id);

    // Set then clear on an untagged session.
    const s = await plan(db, courseId, "untagged");
    expect(s.milestone_id).toBeNull();
    await setSessionMilestone(db, s.id, m.id);
    expect((await getSession(db, s.id))?.milestone_id).toBe(m.id);
    await setSessionMilestone(db, s.id, null);
    expect((await getSession(db, s.id))?.milestone_id).toBeNull();
  });

  it("deleting a Milestone UNMAPS its sessions (ON DELETE SET NULL) — never deletes them (FR-008/SC-007)", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const m = await createMilestone(db, { courseId, capability: "Milestone A", orderIndex: 0 });
    const s1 = await planSession(db, { courseId, objective: "s1", milestoneId: m.id, assignments: [], pretestQuestions: [], cardDrafts: [] });
    const s2 = await planSession(db, { courseId, objective: "s2", milestoneId: m.id, assignments: [], pretestQuestions: [], cardDrafts: [] });

    await deleteMilestone(db, m.id);

    const seq = await listCourseSessions(db, courseId);
    expect(seq.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort()); // both retained
    expect(seq.every((s) => s.milestone_id === null)).toBe(true); // unmapped, not deleted
  });

  it("planning, reordering, and mapping create NO review cards (FR-013/SC-005)", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const a = await plan(db, courseId, "a");
    const b = await plan(db, courseId, "b");
    await reorderCourseSessions(db, courseId, [b.id, a.id]);
    const m = await createMilestone(db, { courseId, capability: "M", orderIndex: 0 });
    await setSessionMilestone(db, a.id, m.id);

    // Cards spawn only when a session is *done* (finalizeSession) — never from plan/sequence/map.
    expect(await listCardsByCourse(db, courseId)).toHaveLength(0);
  });
});

describe("sessions repo — reminder signals (Feature 014)", () => {
  it("countPlannedSessions counts only the active vault's planned sessions", async () => {
    const db = await freshDb();
    const courseA = await seedCourse(db, VID);
    await attachVault(db, { id: "vault-2", path: "/v2" });
    const courseB = await seedCourse(db, "vault-2");

    await plan(db, courseA, "a1");
    const a2 = await plan(db, courseA, "a2");
    await plan(db, courseB, "b1");
    expect(await countPlannedSessions(db, VID)).toBe(2);

    // Completing one drops the planned count; the other vault is unaffected.
    await finalizeSession(db, { sessionId: a2.id, minutes: 1, didRetrieval: false, writeupPath: null, pretestAnswers: [], cards: [] });
    expect(await countPlannedSessions(db, VID)).toBe(1);
    expect(await countPlannedSessions(db, "vault-2")).toBe(1);
  });

  it("hasSessionCompletedOnDay is true only for a day with a completed session in the vault", async () => {
    const db = await freshDb();
    const courseId = await seedCourse(db);
    const today = new Date().toISOString().slice(0, 10);

    await plan(db, courseId, "planned-only");
    expect(await hasSessionCompletedOnDay(db, VID, today)).toBe(false); // nothing completed yet

    const s = await plan(db, courseId, "to finish");
    await finalizeSession(db, { sessionId: s.id, minutes: 1, didRetrieval: false, writeupPath: null, pretestAnswers: [], cards: [] });
    expect(await hasSessionCompletedOnDay(db, VID, today)).toBe(true);
    expect(await hasSessionCompletedOnDay(db, VID, "2020-01-01")).toBe(false);
    expect(await hasSessionCompletedOnDay(db, "vault-2", today)).toBe(false); // other vault
  });
});
