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

    expect(await screen.findByText("Define a limit")).toBeTruthy();
    expect(screen.getByText("new")).toBeTruthy();
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
    await registerResource(db, VID, { title: "Baby Rudin", kind: "book" });
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const select = await screen.findByLabelText("Resource");
    await userEvent.selectOptions(select, within(select).getByRole("option", { name: "Baby Rudin" }));
    await userEvent.type(screen.getByLabelText("Locator"), "page=10");
    await userEvent.click(screen.getByRole("button", { name: "Add citation" }));

    expect(await screen.findByText(/page=10/)).toBeTruthy();
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
