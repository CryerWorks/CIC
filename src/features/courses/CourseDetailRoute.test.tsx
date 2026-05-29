import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, makeReadyDb } from "../../app/test-support";
import { fakeConnector, readyResult } from "../../app/providers/vault/test-support";
import {
  setSetting,
  attachVault,
  createDomain,
  createCourse,
  createCard,
  createMilestone,
  deleteMilestone,
  registerResource,
  linkResourceToCourse,
  planSession,
  finalizeSession,
  listPlannedSessionsByCourse,
  listCourseSessions,
  type SqlExecutor,
} from "../../db";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";

const VID = "vault-detail";

async function seed(): Promise<{ db: SqlExecutor; courseId: string }> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded");
  await attachVault(db, { id: VID, path: "/seeded" });
  const domain = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Real Analysis", domainId: domain.id });
  return { db, courseId: course.id };
}

function renderDetail(db: SqlExecutor, courseId: string) {
  return renderApp({
    initialEntries: [`/courses/${courseId}`],
    initialize: () => Promise.resolve(db),
    connect: fakeConnector({ fallback: readyResult(0, VID) }),
  });
}

describe("CourseDetailRoute (US2)", () => {
  it("adds a card that appears in the list as new", async () => {
    const { db, courseId } = await seed();
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "Add card" }));
    await userEvent.type(screen.getByLabelText("Front"), "Define a limit");
    await userEvent.type(screen.getByLabelText("Back"), "epsilon-delta");
    await userEvent.click(screen.getByRole("button", { name: "Add card" }));

    // The editor stays open on the new card (so citations are reachable), so scope to the list.
    const list = await screen.findByRole("list");
    expect(within(list).getByText("Define a limit")).toBeTruthy();
    expect(within(list).getByText("new")).toBeTruthy();
  });

  it("edits a card's content", async () => {
    const { db, courseId } = await seed();
    await createCard(db, { courseId, front: "Q", back: "A" });
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const front = await screen.findByLabelText("Front");
    await userEvent.clear(front);
    await userEvent.type(front, "Q2");
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));

    expect(await screen.findByText("Q2")).toBeTruthy();
  });

  it("attaches a Resource citation to a card (US4)", async () => {
    const { db, courseId } = await seed();
    await createCard(db, { courseId, front: "Q", back: "A" });
    const res = await registerResource(db, VID, { title: "Baby Rudin", kind: "book" });
    await linkResourceToCourse(db, { courseId, resourceId: res.id, role: "reference" });
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const select = await screen.findByLabelText("Resource");
    await userEvent.selectOptions(select, within(select).getByRole("option", { name: "Baby Rudin" }));
    await userEvent.type(screen.getByLabelText("Locator"), "page=10");
    await userEvent.click(screen.getByRole("button", { name: "Add citation" }));

    expect(await screen.findByText(/page=10/)).toBeTruthy();
  });

  it("offers resource linking right after creating a card (not only on edit)", async () => {
    const { db, courseId } = await seed();
    const res = await registerResource(db, VID, { title: "Baby Rudin", kind: "book" });
    await linkResourceToCourse(db, { courseId, resourceId: res.id, role: "reference" });
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "Add card" }));
    await userEvent.type(screen.getByLabelText("Front"), "Q");
    await userEvent.type(screen.getByLabelText("Back"), "A");
    await userEvent.click(screen.getByRole("button", { name: "Add card" }));

    // The editor stays open on the new card, so its citation picker is available immediately.
    const select = await screen.findByLabelText("Resource");
    await userEvent.selectOptions(select, within(select).getByRole("option", { name: "Baby Rudin" }));
    await userEvent.type(screen.getByLabelText("Locator"), "page=12");
    await userEvent.click(screen.getByRole("button", { name: "Add citation" }));

    expect(await screen.findByText(/page=12/)).toBeTruthy();
  });

  it("labels the citation locator as a Timestamp for a web-hosted video", async () => {
    const { db, courseId } = await seed();
    await createCard(db, { courseId, front: "Q", back: "A" });
    const res = await registerResource(db, VID, { title: "MIT Lecture", kind: "video_url", url: "https://youtu.be/x" });
    await linkResourceToCourse(db, { courseId, resourceId: res.id, role: "reference" });
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const select = await screen.findByLabelText("Resource");
    expect(screen.getByLabelText("Locator")).toBeTruthy(); // page-style before a pick
    await userEvent.selectOptions(select, within(select).getByRole("option", { name: "MIT Lecture" }));

    expect(await screen.findByLabelText("Timestamp")).toBeTruthy();
    expect(screen.queryByLabelText("Locator")).toBeNull();
  });

  it("deletes a card", async () => {
    const { db, courseId } = await seed();
    await createCard(db, { courseId, front: "ToDelete", back: "A" });
    renderDetail(db, courseId);

    await screen.findByText("ToDelete");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("ToDelete")).toBeNull());
  });
});

describe("CourseDetailRoute — planning sessions (US1)", () => {
  it("plans a session (objective + assignment) that persists and appears in the Sessions list", async () => {
    const { db, courseId } = await seed();
    const res = await registerResource(db, VID, { title: "Baby Rudin", kind: "pdf", filePath: "/store/x.pdf" });
    await linkResourceToCourse(db, { courseId, resourceId: res.id, role: "reference" });
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "Plan a session" }));
    await userEvent.type(await screen.findByLabelText("Objective"), "Master the squeeze theorem");
    // Author one assignment through the picker (pretest/card staging are covered at the repo layer).
    await userEvent.selectOptions(screen.getByLabelText("Assign resource"), res.id);
    await userEvent.type(screen.getByLabelText("Assignment locator"), "page=42");
    await userEvent.click(screen.getByRole("button", { name: "Add assignment" }));

    await userEvent.click(screen.getByRole("button", { name: "Save plan" }));

    // Surfaces in the list as planned…
    expect(await screen.findByText("Master the squeeze theorem", undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText("planned")).toBeTruthy();
    // …and persisted with its assignment.
    await waitFor(
      async () => {
        const plans = await listPlannedSessionsByCourse(db, courseId);
        expect(plans).toHaveLength(1);
        expect(plans[0].objective).toBe("Master the squeeze theorem");
      },
      { timeout: 4000 },
    );
  });

  it("blocks saving a plan with no objective", async () => {
    const { db, courseId } = await seed();
    renderDetail(db, courseId);
    await userEvent.click(await screen.findByRole("button", { name: "Plan a session" }));
    expect((screen.getByRole("button", { name: "Save plan" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("deletes a planned session", async () => {
    const { db, courseId } = await seed();
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "Plan a session" }));
    await userEvent.type(await screen.findByLabelText("Objective"), "Throwaway plan");
    await userEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await screen.findByText("Throwaway plan");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Throwaway plan")).toBeNull());
    expect(await listPlannedSessionsByCourse(db, courseId)).toHaveLength(0);
  });
});

/** The sessions `<ol>` is the curriculum list (the cards section renders no list when empty). */
async function curriculumItems() {
  const lists = await screen.findAllByRole("list");
  const ol = lists.find((el) => el.tagName === "OL") ?? lists[lists.length - 1];
  return within(ol).getAllByRole("listitem");
}

describe("CourseDetailRoute — curriculum sequence (US1 / Feature 013)", () => {
  it("shows a Course's sessions as an ordered 1..N sequence in creation order", async () => {
    const { db, courseId } = await seed();
    for (const o of ["Session 1", "Session 2", "Session 3"]) {
      await planSession(db, { courseId, objective: o, assignments: [], pretestQuestions: [], cardDrafts: [] });
    }
    renderDetail(db, courseId);

    await screen.findByText("Session 1", undefined, { timeout: 4000 });
    const items = await curriculumItems();
    expect(items.map((li) => within(li).getByText(/Session \d/).textContent)).toEqual([
      "Session 1",
      "Session 2",
      "Session 3",
    ]);
  });

  it("Move ↑ reorders a session and the new order persists", async () => {
    const { db, courseId } = await seed();
    const seeded = [];
    for (const o of ["Session 1", "Session 2", "Session 3"]) {
      seeded.push(await planSession(db, { courseId, objective: o, assignments: [], pretestQuestions: [], cardDrafts: [] }));
    }
    renderDetail(db, courseId);
    await screen.findByText("Session 3", undefined, { timeout: 4000 });

    // Move the last session up once → [S1, S3, S2].
    await userEvent.click(screen.getByRole("button", { name: "Move up: Session 3" }));

    await waitFor(async () => {
      const seq = await listCourseSessions(db, courseId);
      expect(seq.map((s) => s.objective)).toEqual(["Session 1", "Session 3", "Session 2"]);
    });
    const items = await curriculumItems();
    expect(items.map((li) => within(li).getByText(/Session \d/).textContent)).toEqual([
      "Session 1",
      "Session 3",
      "Session 2",
    ]);
  });

  it("disables Move ↑ on the first row and Move ↓ on the last", async () => {
    const { db, courseId } = await seed();
    for (const o of ["Session 1", "Session 2"]) {
      await planSession(db, { courseId, objective: o, assignments: [], pretestQuestions: [], cardDrafts: [] });
    }
    renderDetail(db, courseId);
    await screen.findByText("Session 1", undefined, { timeout: 4000 });

    expect((screen.getByRole("button", { name: "Move up: Session 1" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move down: Session 2" }) as HTMLButtonElement).disabled).toBe(true);
    // Interior moves are enabled.
    expect((screen.getByRole("button", { name: "Move down: Session 1" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Move up: Session 2" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("CourseDetailRoute — milestone mapping & coverage (US2 / Feature 013)", () => {
  it("assigns a Milestone via the row select; coverage updates live and persists", async () => {
    const { db, courseId } = await seed();
    const m = await createMilestone(db, { courseId, capability: "Milestone A", orderIndex: 0 });
    const s = await planSession(db, { courseId, objective: "S1", assignments: [], pretestQuestions: [], cardDrafts: [] });
    renderDetail(db, courseId);

    // Before: uncovered + unassigned (the count-qualified text is unique vs the select's option).
    await screen.findByText(/Milestone A: 0/, undefined, { timeout: 4000 });
    expect(screen.getByText("unassigned: 1")).toBeTruthy();

    await userEvent.selectOptions(screen.getByLabelText("Milestone for: S1"), m.id);

    // Live coverage update (no reload): A now has 1, unassigned drops to 0.
    expect(await screen.findByText(/Milestone A: 1/)).toBeTruthy();
    expect(screen.getByText("unassigned: 0")).toBeTruthy();
    // Persisted.
    await waitFor(async () => {
      const seq = await listCourseSessions(db, courseId);
      expect(seq.find((x) => x.id === s.id)?.milestone_id).toBe(m.id);
    });
  });

  it("limits the Milestone picker to the Course's own Milestones (FR-010)", async () => {
    const { db, courseId } = await seed();
    await createMilestone(db, { courseId, capability: "Owned Milestone", orderIndex: 0 });
    // A second Course in another Domain with its own Milestone — must NOT appear in this Course's picker.
    const otherDomain = await createDomain(db, VID, { name: "Physics", color: "#00bfbc" });
    const otherCourse = await createCourse(db, { title: "Mechanics", domainId: otherDomain.id });
    await createMilestone(db, { courseId: otherCourse.id, capability: "Foreign Milestone", orderIndex: 0 });
    await planSession(db, { courseId, objective: "S1", assignments: [], pretestQuestions: [], cardDrafts: [] });
    renderDetail(db, courseId);

    const select = await screen.findByLabelText("Milestone for: S1");
    expect(within(select).getByRole("option", { name: "Owned Milestone" })).toBeTruthy();
    expect(within(select).queryByRole("option", { name: "Foreign Milestone" })).toBeNull();
  });

  it("shows coverage: per-milestone counts, an uncovered flag, and an unassigned bucket (FR-009/SC-003)", async () => {
    const { db, courseId } = await seed();
    const a = await createMilestone(db, { courseId, capability: "Milestone A", orderIndex: 0 });
    await createMilestone(db, { courseId, capability: "Milestone B", orderIndex: 1 });
    // Two sessions on A, one left unassigned.
    await planSession(db, { courseId, objective: "S1", milestoneId: a.id, assignments: [], pretestQuestions: [], cardDrafts: [] });
    await planSession(db, { courseId, objective: "S2", milestoneId: a.id, assignments: [], pretestQuestions: [], cardDrafts: [] });
    await planSession(db, { courseId, objective: "S3", assignments: [], pretestQuestions: [], cardDrafts: [] });
    renderDetail(db, courseId);

    expect(await screen.findByText(/Milestone A: 2/)).toBeTruthy();
    expect(screen.getByText(/Milestone B: 0/)).toBeTruthy();
    expect(screen.getByText("uncovered")).toBeTruthy(); // B is uncovered
    expect(screen.getByText("unassigned: 1")).toBeTruthy();
  });

  it("reflects an off-screen Milestone deletion as unassigned on re-entry (FR-008 / C1)", async () => {
    const { db, courseId } = await seed();
    const a = await createMilestone(db, { courseId, capability: "Milestone A", orderIndex: 0 });
    await createMilestone(db, { courseId, capability: "Milestone B", orderIndex: 1 });
    const s = await planSession(db, { courseId, objective: "S1", milestoneId: a.id, assignments: [], pretestQuestions: [], cardDrafts: [] });

    const view = renderDetail(db, courseId);
    expect(((await screen.findByLabelText("Milestone for: S1")) as HTMLSelectElement).value).toBe(a.id);
    expect(screen.getByText(/Milestone A: 1/)).toBeTruthy();

    // Milestone A is deleted on the Courses screen (off-screen here); ON DELETE SET NULL unmaps S1.
    view.unmount();
    await deleteMilestone(db, a.id);

    // Re-entering the Course refetches: S1 is now unassigned (Milestone B remains).
    renderDetail(db, courseId);
    const select = (await screen.findByLabelText("Milestone for: S1")) as HTMLSelectElement;
    expect(select.value).toBe(""); // unmapped — never deleted
    expect(screen.getByText("unassigned: 1")).toBeTruthy();
    expect((await listCourseSessions(db, courseId)).find((x) => x.id === s.id)?.milestone_id).toBeNull();
  });
});

describe("CourseDetailRoute — progress & completed sessions (US3 / Feature 013)", () => {
  it("renders completed sessions read-only in place and a literal done/total progress (no mastery wording)", async () => {
    const { db, courseId } = await seed();
    const s1 = await planSession(db, { courseId, objective: "Done one", assignments: [], pretestQuestions: [], cardDrafts: [] });
    await planSession(db, { courseId, objective: "Still planned", assignments: [], pretestQuestions: [], cardDrafts: [] });
    await finalizeSession(db, { sessionId: s1.id, minutes: 10, didRetrieval: true, writeupPath: null, pretestAnswers: [], cards: [] });
    renderDetail(db, courseId);

    await screen.findByText("Done one", undefined, { timeout: 4000 });

    // Progress is a literal count — never "mastered"/"learned" (Constitution III).
    expect(screen.getByText("Progress 1 / 2")).toBeTruthy();
    expect(screen.queryByText(/master|learned/i)).toBeNull();

    // The completed row is read-only: a "done" badge, no Move/Delete controls.
    expect(screen.getByText("done")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Move up: Done one" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move down: Done one" })).toBeNull();
    // The planned row keeps its controls.
    expect(screen.getByRole("button", { name: "Move down: Still planned" })).toBeTruthy();

    // Completed keeps its sequence position (planned earlier, so it stays first).
    const items = await curriculumItems();
    expect(within(items[0]).getByText("Done one")).toBeTruthy();
    expect(within(items[1]).getByText("Still planned")).toBeTruthy();
  });
});
