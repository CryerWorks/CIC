import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp } from "./test-support";

describe("routing (FR-001/FR-002/FR-004; SC-001)", () => {
  it("renders the Dashboard placeholder at /", async () => {
    renderApp({ initialEntries: ["/"] });
    expect(await screen.findByText(/dashboard arrives in a later feature/i)).toBeTruthy();
  });

  it("renders the Review placeholder", async () => {
    renderApp({ initialEntries: ["/review"] });
    expect(await screen.findByText(/review arrives in a later feature/i)).toBeTruthy();
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
    renderApp({ initialEntries: ["/does-not-exist"] });
    expect(await screen.findByText(/dashboard arrives in a later feature/i)).toBeTruthy();
  });

  it("marks the active destination with aria-current", async () => {
    renderApp({ initialEntries: ["/domains"] });
    const link = await screen.findByRole("link", { name: "Domains" });
    expect(link.getAttribute("aria-current")).toBe("page");
  });
});
