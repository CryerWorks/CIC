import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, makeReadyDb } from "./test-support";
import { createDomain } from "../db";

describe("accessibility & keyboard (FR-014/SC-007)", () => {
  it("exposes primary nav as activatable links, marking the active one with aria-current", async () => {
    renderApp({ initialEntries: ["/domains"] });
    expect(await screen.findByRole("navigation", { name: /primary/i })).toBeTruthy();
    const domains = await screen.findByRole("link", { name: "Domains" });
    expect(domains.getAttribute("aria-current")).toBe("page");
    expect(domains.getAttribute("href")).toBeTruthy(); // focusable + keyboard-activatable
  });

  it("labels the create form's fields and offers the color choices as real radios", async () => {
    renderApp({ initialEntries: ["/domains"], initialize: makeReadyDb });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new domain|create your first/i }));

    expect(screen.getByLabelText("Name")).toBeTruthy(); // label association (AT-reachable)
    expect(screen.getAllByRole("radio")).toHaveLength(5); // native radios → keyboard-navigable
    expect(screen.getByRole("radio", { name: "Green" })).toBeTruthy();
  });

  it("closes the delete dialog on Escape", async () => {
    const db = await makeReadyDb();
    await createDomain(db, { name: "X", color: "#8b6cef" });
    renderApp({ initialEntries: ["/domains"], initialize: () => Promise.resolve(db) });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
