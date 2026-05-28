import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DomainsRoute } from "./DomainsRoute";
import { renderWithVault, fakeConnector, readyResult } from "../../providers/vault/test-support";
import { makeReadyDb, failingOn } from "../../test-support";
import { setSetting, attachVault, createDomain, listDomains, type SqlExecutor } from "../../../db";
import { VAULT_PATH_KEY } from "../../providers/vault/keys";

const VID = "vault-1";
const PATH = "/seeded/vault";
const connectAs = (id: string) => fakeConnector({ fallback: readyResult(0, id) });

/** A ready (vault-connected) store with a `vaults` row for VID, optionally seeded. */
async function readyDb(seed?: (db: SqlExecutor) => Promise<void>): Promise<SqlExecutor> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, PATH);
  await attachVault(db, { id: VID, path: PATH });
  if (seed) await seed(db);
  return db;
}

async function renderDomains(db: SqlExecutor) {
  renderWithVault({
    children: <DomainsRoute />,
    connect: connectAs(VID),
    initialize: () => Promise.resolve(db),
  });
  await screen.findByRole("heading", { name: "Domains" });
}

const openCreate = async (user: ReturnType<typeof userEvent.setup>) => {
  const buttons = await screen.findAllByRole("button", { name: /new domain|create your first/i });
  await user.click(buttons[0]);
};

describe("Domains — vault gating (US2: FR-006)", () => {
  it("with no vault connected, guides the user to connect one and offers no create", async () => {
    renderWithVault({ children: <DomainsRoute />, connect: connectAs(VID) });
    expect(await screen.findByText(/connect a vault first/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /new domain/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Domains" })).toBeNull();
  });
});

describe("Domains — create & list (US2: FR-004/FR-005)", () => {
  it("shows a guiding empty state when there are no domains", async () => {
    await renderDomains(await readyDb());
    expect(await screen.findByText(/no domains yet/i)).toBeTruthy();
  });

  it("creates a domain (attached to the active vault) that appears and persists", async () => {
    const db = await readyDb();
    const user = userEvent.setup();
    await renderDomains(db);

    await openCreate(user);
    await user.type(screen.getByLabelText("Name"), "Mathematics");
    await user.click(screen.getByRole("button", { name: /create domain/i }));

    expect(await screen.findByText("Mathematics")).toBeTruthy();
    await waitFor(async () =>
      expect((await listDomains(db, VID)).some((d) => d.name === "Mathematics")).toBe(true),
    );
  });

  it("rejects a blank name with nothing persisted", async () => {
    const db = await readyDb();
    const user = userEvent.setup();
    await renderDomains(db);

    await openCreate(user);
    await user.click(screen.getByRole("button", { name: /create domain/i }));

    expect(await screen.findByText(/name is required/i)).toBeTruthy();
    expect(await listDomains(db, VID)).toHaveLength(0);
  });

  it("rejects a duplicate name (case-insensitive)", async () => {
    const db = await readyDb((d) => createDomain(d, VID, { name: "Physics", color: "#8b6cef" }).then(() => {}));
    const user = userEvent.setup();
    await renderDomains(db);

    await openCreate(user);
    await user.type(screen.getByLabelText("Name"), "physics");
    await user.click(screen.getByRole("button", { name: /create domain/i }));

    expect(await screen.findByText(/already exists/i)).toBeTruthy();
  });

  it("reverts an optimistic create when the write fails (no phantom row)", async () => {
    const base = await readyDb();
    const db = failingOn(base, /INSERT INTO domains/);
    const user = userEvent.setup();
    await renderDomains(db);

    await openCreate(user);
    await user.type(screen.getByLabelText("Name"), "Ghost");
    await user.click(screen.getByRole("button", { name: /create domain/i }));

    expect(await screen.findByText(/simulated write failure/i)).toBeTruthy();
    expect(screen.queryByText("Ghost")).toBeNull(); // reverted (input value isn't a text node)
    expect(await listDomains(base, VID)).toHaveLength(0);
  });
});

describe("Domains — edit (US3: FR-009)", () => {
  it("edits a domain's name + color and persists the change", async () => {
    const db = await readyDb((d) => createDomain(d, VID, { name: "Mathy", color: "#8b6cef" }).then(() => {}));
    const user = userEvent.setup();
    await renderDomains(db);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Mathematics");
    await user.click(screen.getByRole("radio", { name: "Green" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Mathematics")).toBeTruthy();
    await waitFor(async () => {
      const rows = await listDomains(db, VID);
      expect(rows[0].name).toBe("Mathematics");
      expect(rows[0].color).toBe("#44cf6e");
    });
  });

  it("rejects an edit that duplicates another domain's name", async () => {
    const db = await readyDb(async (d) => {
      await createDomain(d, VID, { name: "Alpha", color: "#8b6cef" });
      await createDomain(d, VID, { name: "Beta", color: "#4c8dff" });
    });
    const user = userEvent.setup();
    await renderDomains(db);

    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    await user.click(editButtons[1]); // Beta (list ordered by name)
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Alpha");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/already exists/i)).toBeTruthy();
  });

  it("reverts an optimistic edit when the update fails", async () => {
    const base = await readyDb((d) => createDomain(d, VID, { name: "Original", color: "#8b6cef" }).then(() => {}));
    const db = failingOn(base, /UPDATE domains/);
    const user = userEvent.setup();
    await renderDomains(db);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Changed");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/simulated write failure/i)).toBeTruthy();
    expect(await screen.findByText("Original")).toBeTruthy(); // reverted in the list
    expect((await listDomains(base, VID))[0].name).toBe("Original");
  });
});

describe("Domains — delete (US4: FR-010)", () => {
  it("confirms the cascade and deletes on confirm", async () => {
    const db = await readyDb((d) => createDomain(d, VID, { name: "ToDelete", color: "#8b6cef" }).then(() => {}));
    const user = userEvent.setup();
    await renderDomains(db);

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/campaigns and courses/i);

    await user.click(screen.getByRole("button", { name: /delete domain/i }));
    await waitFor(async () => expect(await listDomains(db, VID)).toHaveLength(0));
  });

  it("keeps the domain when the confirmation is cancelled", async () => {
    const db = await readyDb((d) => createDomain(d, VID, { name: "Keep", color: "#8b6cef" }).then(() => {}));
    const user = userEvent.setup();
    await renderDomains(db);

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await listDomains(db, VID)).toHaveLength(1);
  });

  it("reverts an optimistic delete when it fails (row reappears)", async () => {
    const base = await readyDb((d) => createDomain(d, VID, { name: "Sticky", color: "#8b6cef" }).then(() => {}));
    const db = failingOn(base, /DELETE FROM domains/);
    const user = userEvent.setup();
    await renderDomains(db);

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: /delete domain/i }));

    expect(await screen.findByText("Sticky")).toBeTruthy();
    expect(await listDomains(base, VID)).toHaveLength(1);
  });
});
