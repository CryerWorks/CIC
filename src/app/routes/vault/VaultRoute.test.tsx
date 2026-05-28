import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultRoute } from "./VaultRoute";
import {
  renderWithVault,
  fakePicker,
  fakeConnector,
  readyResult,
} from "../../providers/vault/test-support";

describe("VaultRoute screen (US1 · FR-001/011/012)", () => {
  it("shows onboarding when unset, then connected status + note count after choosing", async () => {
    renderWithVault({
      children: <VaultRoute />,
      picker: fakePicker("/Users/me/Vault"),
      connect: fakeConnector({ fallback: readyResult(7) }),
    });

    expect(await screen.findByText(/connect your obsidian vault/i)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /choose folder/i }));

    expect(await screen.findByText(/vault connected/i)).toBeTruthy();
    expect(screen.getByText("/Users/me/Vault")).toBeTruthy();
    expect(screen.getByText(/7 Markdown notes found/i)).toBeTruthy();
  });
});
