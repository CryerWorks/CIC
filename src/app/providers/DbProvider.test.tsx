import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp, makeReadyDb } from "../test-support";

describe("DbProvider — store-health gate (FR-003/SC-003)", () => {
  it("shows a loading state while the store is opening", async () => {
    renderApp({ initialize: () => new Promise(() => {}) }); // never resolves
    expect(await screen.findByText(/opening your local store/i)).toBeTruthy();
  });

  it("surfaces a clear error when the store fails to open", async () => {
    renderApp({ initialize: () => Promise.reject(new Error("disk on fire")) });
    expect(await screen.findByText(/couldn.?t open your local store/i)).toBeTruthy();
    expect(await screen.findByText(/disk on fire/i)).toBeTruthy();
  });

  it("renders the navigable shell once the store is ready", async () => {
    renderApp({ initialize: makeReadyDb, initialEntries: ["/"] });
    expect(await screen.findByRole("navigation", { name: /primary/i })).toBeTruthy();
  });
});
