import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewRoute } from "./ReviewRoute";
import { renderWithVault, fakeConnector, readyResult } from "../../app/providers/vault/test-support";
import { makeReadyDb } from "../../app/test-support";
import { createDomain, createCourse, createCard, setSetting, attachVault, type SqlExecutor } from "../../db";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";

const VID = "vault-srs";

async function readyDb(seed?: (db: SqlExecutor, courseId: string) => Promise<void>): Promise<SqlExecutor> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded");
  await attachVault(db, { id: VID, path: "/seeded" });
  const domain = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Real Analysis", domainId: domain.id });
  if (seed) await seed(db, course.id);
  return db;
}

function renderReview(db: SqlExecutor) {
  return renderWithVault({
    children: <ReviewRoute />,
    connect: fakeConnector({ fallback: readyResult(0, VID) }),
    initialize: () => Promise.resolve(db),
    initialEntries: ["/review"],
  });
}

const disabled = (name: string) => (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

describe("ReviewRoute (US1)", () => {
  it("gates on a connected vault", async () => {
    renderWithVault({ children: <ReviewRoute /> }); // makeReadyDb has no stored vault → unset
    expect(await screen.findByText(/connect a vault first/i)).toBeTruthy();
  });

  it("hides the answer until revealed, then shows the grade buttons (retrieval-before-reveal)", async () => {
    const db = await readyDb((d, courseId) =>
      createCard(d, { courseId, front: "Define a limit", back: "epsilon-delta" }).then(() => {}),
    );
    renderReview(db);

    expect(await screen.findByText("Define a limit")).toBeTruthy();
    expect(screen.queryByText("epsilon-delta")).toBeNull(); // back hidden before reveal

    await userEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByText("epsilon-delta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Good" })).toBeTruthy();
  });

  it("blocks grading until a confidence is picked (no default — Constitution III)", async () => {
    const db = await readyDb((d, courseId) => createCard(d, { courseId, front: "Q", back: "A" }).then(() => {}));
    renderReview(db);

    await userEvent.click(await screen.findByRole("button", { name: "Show answer" }));
    expect(disabled("Good")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Confidence 3" }));
    expect(disabled("Good")).toBe(false);
  });

  it("grades a card and advances to the next, dropping the count", async () => {
    const db = await readyDb(async (d, courseId) => {
      await createCard(d, { courseId, front: "Q1", back: "A1" });
      await createCard(d, { courseId, front: "Q2", back: "A2" });
    });
    renderReview(db);

    expect(await screen.findByText("Q1")).toBeTruthy();
    expect(screen.getByText("2 left")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await userEvent.click(screen.getByRole("button", { name: "Confidence 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Good" }));

    expect(await screen.findByText("Q2")).toBeTruthy();
    expect(screen.getByText("1 left")).toBeTruthy();
  });

  it("shows a caught-up state when nothing is due", async () => {
    const db = await readyDb(); // no cards
    renderReview(db);
    expect(await screen.findByText(/all caught up/i)).toBeTruthy();
  });
});
