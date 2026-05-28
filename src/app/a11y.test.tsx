import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, makeReadyDb } from "./test-support";
import { fakeConnector, readyResult } from "./providers/vault/test-support";
import { setSetting, attachVault, createDomain } from "../db";
import { VAULT_PATH_KEY } from "./providers/vault/keys";

const VID = "vault-1";
const connectReady = fakeConnector({ fallback: readyResult(0, VID) });

/** A ready (vault-connected) store with a `vaults` row for VID, optionally seeded. */
async function readyDb(seed?: (db: Awaited<ReturnType<typeof makeReadyDb>>) => Promise<void>) {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded/vault");
  await attachVault(db, { id: VID, path: "/seeded/vault" });
  if (seed) await seed(db);
  return db;
}

describe("accessibility & keyboard (FR-014/SC-007)", () => {
  it("exposes primary nav as activatable links, marking the active one with aria-current", async () => {
    renderApp({ initialEntries: ["/domains"] });
    expect(await screen.findByRole("navigation", { name: /primary/i })).toBeTruthy();
    const domains = await screen.findByRole("link", { name: "Domains" });
    expect(domains.getAttribute("aria-current")).toBe("page");
    expect(domains.getAttribute("href")).toBeTruthy(); // focusable + keyboard-activatable
  });

  it("labels the create form's fields and offers the color choices as real radios", async () => {
    renderApp({ initialEntries: ["/domains"], initialize: readyDb, connect: connectReady });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new domain|create your first/i }));

    expect(screen.getByLabelText("Name")).toBeTruthy(); // label association (AT-reachable)
    expect(screen.getAllByRole("radio")).toHaveLength(5); // native radios → keyboard-navigable
    expect(screen.getByRole("radio", { name: "Green" })).toBeTruthy();
  });

  it("closes the delete dialog on Escape", async () => {
    const db = await readyDb((d) => createDomain(d, VID, { name: "X", color: "#8b6cef" }).then(() => {}));
    renderApp({ initialEntries: ["/domains"], initialize: () => Promise.resolve(db), connect: connectReady });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
