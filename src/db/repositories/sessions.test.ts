// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import { registerResource } from "./resources";
import { listCardsByCourse } from "./cards";
import { listCardResources } from "./cardResources";
import {
  planSession,
  finalizeSession,
  listPlannedSessions,
  listPlannedSessionsByCourse,
  listSessionsByVault,
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
