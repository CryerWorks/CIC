import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { DashboardRoute } from "./DashboardRoute";
import {
  renderWithVault,
  fakeConnector,
  readyResult,
} from "../providers/vault/test-support";
import { makeReadyDb } from "../test-support";
import { setSetting } from "../../db";
import { VAULT_PATH_KEY } from "../providers/vault/keys";

describe("Dashboard first-run banner (US1 · FR-005)", () => {
  it("shows a 'choose your vault' banner linking to /vault when no vault is set", async () => {
    renderWithVault({ children: <DashboardRoute />, connect: fakeConnector({ fallback: readyResult(0) }) });

    expect(await screen.findByText(/no vault connected/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /choose your vault/i });
    expect(link.getAttribute("href")).toBe("/vault");
  });

  it("hides the banner once a vault is connected", async () => {
    const db = await makeReadyDb();
    await setSetting(db, VAULT_PATH_KEY, "/seeded/vault");

    renderWithVault({
      children: <DashboardRoute />,
      connect: fakeConnector({ fallback: readyResult(0) }),
      initialize: () => Promise.resolve(db),
    });

    // The Dashboard placeholder renders regardless; the banner must be gone once ready.
    expect(await screen.findByText(/dashboard arrives in a later feature/i)).toBeTruthy();
    expect(screen.queryByText(/no vault connected/i)).toBeNull();
  });
});
