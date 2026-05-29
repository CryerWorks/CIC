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
  registerResource,
  linkResourceToCourse,
  listPlannedSessionsByCourse,
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
