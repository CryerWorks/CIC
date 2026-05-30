import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp, makeReadyDb } from "../../app/test-support";
import { fakeConnector, readyResult } from "../../app/providers/vault/test-support";
import {
  setSetting,
  attachVault,
  createDomain,
  createCourse,
  createMilestone,
  createProject,
  type SqlExecutor,
} from "../../db";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";

const VID = "vault-dash";

async function seed(withProject: boolean): Promise<SqlExecutor> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded");
  await attachVault(db, { id: VID, path: "/seeded" });
  const domain = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Linear Algebra", domainId: domain.id });
  const m = await createMilestone(db, { courseId: course.id, capability: "Diagonalize", orderIndex: 0 });
  if (withProject) {
    await createProject(db, { courseId: course.id, title: "Diagonalize a 3×3", capability: "c", milestoneIds: [m.id] });
  }
  return db;
}

function renderDashboard(db: SqlExecutor) {
  // The dashboard is read-only, so a stub vault is fine (no vault writes).
  return renderApp({
    initialEntries: ["/"],
    initialize: () => Promise.resolve(db),
    connect: fakeConnector({ fallback: readyResult(0, VID) }),
  });
}

describe("Dashboard — active projects (Feature 015 / US3)", () => {
  it("surfaces an active Project under its Domain, linking to the Course", async () => {
    renderDashboard(await seed(true));
    const panel = await screen.findByText("Active projects", undefined, { timeout: 4000 });
    expect(panel).toBeTruthy();
    expect(screen.getByText("Diagonalize a 3×3")).toBeTruthy();
  });

  it("renders no active-projects panel when there are none (no fabricated data)", async () => {
    renderDashboard(await seed(false));
    // Wait for the dashboard to settle (the Command Center header appears).
    await screen.findByText("Command Center", undefined, { timeout: 4000 });
    expect(screen.queryByText("Active projects")).toBeNull();
  });
});
