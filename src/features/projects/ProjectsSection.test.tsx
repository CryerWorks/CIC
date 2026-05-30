import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, makeReadyDb } from "../../app/test-support";
import { createVaultIdentity } from "../../vault/identity";
import { makeTempVault, type TempVault } from "../../vault/test-support";
import {
  setSetting,
  attachVault,
  createDomain,
  createCourse,
  createMilestone,
  listCourseProjects,
  type SqlExecutor,
} from "../../db";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";
import type { VaultConnector } from "../../app/providers/vault/connect";

const VID = "vault-projects";

const vaults: TempVault[] = [];
afterEach(() => {
  for (const v of vaults.splice(0)) v.cleanup();
});

function realVaultConnector(): VaultConnector {
  const tv = makeTempVault();
  vaults.push(tv);
  return () =>
    Promise.resolve({
      ok: true,
      vault: { reader: tv.reader, writer: tv.writer, identity: createVaultIdentity(tv.fs, tv.vaultPath) },
      noteCount: 0,
      id: VID,
    });
}

async function seed(): Promise<{ db: SqlExecutor; courseId: string; milestoneCap: string }> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded");
  await attachVault(db, { id: VID, path: "/seeded" });
  const domain = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Linear Algebra", domainId: domain.id });
  await createMilestone(db, { courseId: course.id, capability: "Diagonalize a matrix", orderIndex: 0 });
  return { db, courseId: course.id, milestoneCap: "Diagonalize a matrix" };
}

function renderDetail(db: SqlExecutor, courseId: string) {
  return renderApp({
    initialEntries: [`/courses/${courseId}`],
    initialize: () => Promise.resolve(db),
    connect: realVaultConnector(),
  });
}

describe("ProjectsSection (US1)", () => {
  it("blocks creation until title + capability + ≥1 milestone, then lists the new Project", async () => {
    const { db, courseId } = await seed();
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "New project" }));

    const createBtn = () => screen.getByRole("button", { name: "Create project" }) as HTMLButtonElement;
    expect(createBtn().disabled).toBe(true); // nothing filled

    await userEvent.type(screen.getByLabelText("Project title"), "Diagonalize a 3×3");
    await userEvent.type(screen.getByLabelText("Project capability"), "I can diagonalize unaided.");
    expect(createBtn().disabled).toBe(true); // still no milestone

    await userEvent.click(screen.getByLabelText("Milestone: Diagonalize a matrix"));
    expect(createBtn().disabled).toBe(false);

    await userEvent.click(createBtn());

    expect(await screen.findByText("Diagonalize a 3×3", undefined, { timeout: 4000 })).toBeTruthy();
    await waitFor(async () => expect(await listCourseProjects(db, courseId)).toHaveLength(1), { timeout: 4000 });
  });

  it("limits the milestone picker to the Course's own milestones", async () => {
    const { db, courseId } = await seed();
    // A foreign milestone on another course must NOT appear in this Project form.
    const otherDomain = await createDomain(db, VID, { name: "Physics", color: "#00bfbc" });
    const otherCourse = await createCourse(db, { title: "Mechanics", domainId: otherDomain.id });
    await createMilestone(db, { courseId: otherCourse.id, capability: "Foreign milestone", orderIndex: 0 });
    renderDetail(db, courseId);

    await userEvent.click(await screen.findByRole("button", { name: "New project" }));
    expect(screen.getByLabelText("Milestone: Diagonalize a matrix")).toBeTruthy();
    expect(screen.queryByLabelText("Milestone: Foreign milestone")).toBeNull();
  });

  it("shows a calm empty state with no fabricated data (SC-007/SC-008)", async () => {
    const { db, courseId } = await seed();
    renderDetail(db, courseId);
    expect(await screen.findByText("No projects yet.", undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/Projects are optional/i)).toBeTruthy();
  });
});
