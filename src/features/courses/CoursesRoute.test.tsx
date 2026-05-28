import { describe, it, expect, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CoursesRoute } from "./CoursesRoute";
import {
  renderWithVault,
  fakeConnector,
  readyResult,
} from "../../app/providers/vault/test-support";
import { makeReadyDb } from "../../app/test-support";
import { createDomain, setSetting, type SqlExecutor } from "../../db";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";
import { makeTempVault, type TempVault } from "../../vault/test-support";
import type { VaultConnector } from "../../app/providers/vault/connect";

const vaults: TempVault[] = [];
afterEach(() => {
  for (const v of vaults.splice(0)) v.cleanup();
});

/** A connector that hands back a real temp vault, so the create→materialize→write path runs
 *  end-to-end against a genuine filesystem (Tauri-free). */
function realVaultConnector(): { connect: VaultConnector; tv: TempVault } {
  const tv = makeTempVault();
  vaults.push(tv);
  const connect: VaultConnector = () =>
    Promise.resolve({ ok: true, vault: { reader: tv.reader, writer: tv.writer }, noteCount: 0 });
  return { connect, tv };
}

async function readyDb(seed?: (db: SqlExecutor) => Promise<void>): Promise<SqlExecutor> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded"); // a stored path → VaultProvider boots to `ready`
  if (seed) await seed(db);
  return db;
}

describe("CoursesRoute — vault gating (US1 · FR-014)", () => {
  it("guides to /vault when no vault is connected", async () => {
    renderWithVault({
      children: <CoursesRoute />,
      connect: fakeConnector({ fallback: readyResult(0) }),
    });
    expect(await screen.findByText(/connect a vault first/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /choose your vault/i }).getAttribute("href")).toBe("/vault");
  });

  it("guides to create a Domain first when none exist", async () => {
    const db = await readyDb();
    const { connect } = realVaultConnector();
    renderWithVault({ children: <CoursesRoute />, connect, initialize: () => Promise.resolve(db) });
    expect(await screen.findByText(/create a domain first/i)).toBeTruthy();
  });
});

describe("CoursesRoute — create flow (US1 · FR-001/006/008)", () => {
  it("creates a Course, lists it, and writes its MOC into the vault", async () => {
    const db = await readyDb((d) => createDomain(d, { name: "Mathematics", color: "#8b6cef" }).then(() => {}));
    const { connect, tv } = realVaultConnector();
    renderWithVault({ children: <CoursesRoute />, connect, initialize: () => Promise.resolve(db) });

    await userEvent.click(await screen.findByRole("button", { name: "New course" }));
    await userEvent.type(screen.getByLabelText("Title"), "Real Analysis");
    const domain = screen.getByLabelText("Domain");
    await userEvent.selectOptions(domain, within(domain).getByRole("option", { name: "Mathematics" }));
    await userEvent.type(screen.getByLabelText("Capability"), "Work rigorously with limits.");
    await userEvent.click(screen.getByRole("button", { name: "Create course" }));

    expect(await screen.findByText("Real Analysis")).toBeTruthy();
    expect(await tv.reader.exists("Courses/Real Analysis.md")).toBe(true);
  });

  it("blocks submit without a Domain", async () => {
    const db = await readyDb((d) => createDomain(d, { name: "Mathematics", color: "#8b6cef" }).then(() => {}));
    const { connect } = realVaultConnector();
    renderWithVault({ children: <CoursesRoute />, connect, initialize: () => Promise.resolve(db) });

    await userEvent.click(await screen.findByRole("button", { name: "New course" }));
    await userEvent.type(screen.getByLabelText("Title"), "No Domain Course");
    await userEvent.click(screen.getByRole("button", { name: "Create course" }));

    expect(await screen.findByText(/choose a domain/i)).toBeTruthy();
    expect(screen.queryByText("No Domain Course")).toBeNull();
  });
});

async function seedDomainDb() {
  return readyDb((d) => createDomain(d, { name: "Mathematics", color: "#8b6cef" }).then(() => {}));
}

async function createCourseInUI(title: string) {
  await userEvent.click(await screen.findByRole("button", { name: "New course" }));
  await userEvent.type(screen.getByLabelText("Title"), title);
  const domain = screen.getByLabelText("Domain");
  await userEvent.selectOptions(domain, within(domain).getByRole("option", { name: "Mathematics" }));
  await userEvent.click(screen.getByRole("button", { name: "Create course" }));
  await screen.findByText(title);
}

describe("CoursesRoute — edit & drift (US2 · FR-003/010/012)", () => {
  it("edits a course; the new title appears in the list", async () => {
    const db = await seedDomainDb();
    const { connect } = realVaultConnector();
    renderWithVault({ children: <CoursesRoute />, connect, initialize: () => Promise.resolve(db) });

    await createCourseInUI("Real Analysis");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const titleField = await screen.findByLabelText("Title");
    await userEvent.clear(titleField);
    await userEvent.type(titleField, "Real Analysis II");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Real Analysis II")).toBeTruthy();
  });

  it("surfaces external drift and resolves it with Reload & reapply (user edit preserved)", async () => {
    const db = await seedDomainDb();
    const { connect, tv } = realVaultConnector();
    renderWithVault({ children: <CoursesRoute />, connect, initialize: () => Promise.resolve(db) });

    await createCourseInUI("Real Analysis");

    // Simulate an Obsidian edit to the MOC between saves.
    const abs = join(tv.vaultPath, "Courses", "Real Analysis.md");
    writeFileSync(abs, `${readFileSync(abs, "utf8")}\nExternal edit.\n`);

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.type(await screen.findByLabelText("Capability"), "Updated capability.");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/MOC changed in Obsidian/i)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /reload & reapply/i }));

    await waitFor(() => expect(screen.queryByText(/MOC changed in Obsidian/i)).toBeNull());
    expect(readFileSync(abs, "utf8")).toContain("External edit.");
  });
});
