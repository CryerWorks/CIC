import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp, makeReadyDb } from "./test-support";
import { fakeConnector, readyResult } from "./providers/vault/test-support";
import { setSetting } from "../db";
import { VAULT_PATH_KEY } from "./providers/vault/keys";

/** A ready (vault-connected) but empty store, so the Dashboard renders onboarding (FR-006). */
async function readyEmptyDb() {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded/vault");
  return db;
}
const connectReady = fakeConnector({ fallback: readyResult(0, "vault-1") });

describe("routing (FR-001/FR-002/FR-004; SC-001)", () => {
  it("renders the Dashboard at / (onboarding for an empty store)", async () => {
    renderApp({ initialEntries: ["/"], initialize: readyEmptyDb, connect: connectReady });
    expect(await screen.findByText(/welcome to cic/i)).toBeTruthy();
  });

  it("renders the Review screen, gated on a connected vault (unset → guidance)", async () => {
    renderApp({ initialEntries: ["/review"] });
    expect(await screen.findByText(/connect a vault first/i)).toBeTruthy();
  });

  it("gates Courses on a connected vault (unset → guidance)", async () => {
    renderApp({ initialEntries: ["/courses"] });
    expect(await screen.findByText(/connect a vault first/i)).toBeTruthy();
  });

  it("renders the style guide at /style", async () => {
    renderApp({ initialEntries: ["/style"] });
    expect(await screen.findByRole("heading", { name: /design system/i })).toBeTruthy();
  });

  it("redirects an unknown path back to the dashboard", async () => {
    renderApp({ initialEntries: ["/does-not-exist"], initialize: readyEmptyDb, connect: connectReady });
    expect(await screen.findByText(/welcome to cic/i)).toBeTruthy();
  });

  it("marks the active destination with aria-current", async () => {
    renderApp({ initialEntries: ["/domains"] });
    const link = await screen.findByRole("link", { name: "Domains" });
    expect(link.getAttribute("aria-current")).toBe("page");
  });
});
