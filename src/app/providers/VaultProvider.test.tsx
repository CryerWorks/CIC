import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useVaultState, useVaultActions, useVaultError } from "./VaultProvider";
import {
  renderWithVault,
  fakePicker,
  fakeConnector,
  readyResult,
  unavailableResult,
} from "./vault/test-support";
import { makeReadyDb } from "../test-support";
import { getSetting, setSetting, type SqlExecutor } from "../../db";
import { VAULT_PATH_KEY } from "./vault/keys";
import type { VaultConnector, ConnectResult } from "./vault/connect";

/** A tiny consumer that surfaces the vault state + lets a test drive the actions. */
function Harness() {
  const state = useVaultState();
  const { chooseVault, retry } = useVaultActions();
  const error = useVaultError();
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      {state.status === "ready" && <span data-testid="count">{state.noteCount}</span>}
      {state.status === "ready" && <span data-testid="path">{state.path}</span>}
      {error && <span data-testid="error">{error.message}</span>}
      <button onClick={() => void chooseVault()}>choose</button>
      <button onClick={() => void retry()}>retry</button>
    </div>
  );
}

async function seededDb(): Promise<SqlExecutor> {
  return makeReadyDb();
}

/** A picker that must never be invoked (boot should connect the stored path without it). */
const neverPicker = () => {
  throw new Error("picker should not be called");
};

describe("VaultProvider — first run (US1 · FR-001/002/008/012 · SC-001/007)", () => {
  it("resolves to `unset` when no vault path is stored", async () => {
    renderWithVault({
      children: <Harness />,
      picker: fakePicker("/v"),
      connect: fakeConnector({ fallback: readyResult(0) }),
    });
    await screen.findByText("unset"); // boots through `checking` → `unset`
  });

  it("chooseVault → connect → ready with the note count, and persists vault.path", async () => {
    const db = await seededDb();
    renderWithVault({
      children: <Harness />,
      picker: fakePicker("/my/vault"),
      connect: fakeConnector({ fallback: readyResult(3) }),
      initialize: () => Promise.resolve(db),
    });
    await screen.findByText("unset");

    await userEvent.click(screen.getByText("choose"));

    await screen.findByText("ready");
    expect(screen.getByTestId("count").textContent).toBe("3");
    expect(screen.getByTestId("path").textContent).toBe("/my/vault");
    expect(await getSetting(db, VAULT_PATH_KEY)).toBe("/my/vault");
  });

  it("cancel (picker returns null) leaves the config unchanged", async () => {
    const db = await seededDb();
    renderWithVault({
      children: <Harness />,
      picker: fakePicker(null),
      connect: fakeConnector({ fallback: readyResult(1) }),
      initialize: () => Promise.resolve(db),
    });
    await screen.findByText("unset");

    await userEvent.click(screen.getByText("choose"));

    expect(screen.getByTestId("status").textContent).toBe("unset");
    expect(await getSetting(db, VAULT_PATH_KEY)).toBeNull();
  });

  it("a folder that fails to connect surfaces an error, stays unset, persists nothing", async () => {
    const db = await seededDb();
    renderWithVault({
      children: <Harness />,
      picker: fakePicker("/broken"),
      connect: fakeConnector({ fallback: unavailableResult("denied") }),
      initialize: () => Promise.resolve(db),
    });
    await screen.findByText("unset");

    await userEvent.click(screen.getByText("choose"));

    await screen.findByText("denied"); // error surfaced
    expect(screen.getByTestId("status").textContent).toBe("unset");
    expect(await getSetting(db, VAULT_PATH_KEY)).toBeNull();
  });
});

describe("VaultProvider — persistence & recovery (US2 · FR-003/007 · SC-002/004)", () => {
  it("a stored path connects on boot → ready, with no picker call (restart)", async () => {
    const db = await makeReadyDb();
    await setSetting(db, VAULT_PATH_KEY, "/seeded");
    renderWithVault({
      children: <Harness />,
      picker: neverPicker,
      connect: fakeConnector({ fallback: readyResult(5) }),
      initialize: () => Promise.resolve(db),
    });

    await screen.findByText("ready"); // picker would have thrown if called
    expect(screen.getByTestId("path").textContent).toBe("/seeded");
    expect(screen.getByTestId("count").textContent).toBe("5");
  });

  it("a stored path that won't connect → unavailable (no crash); retry recovers", async () => {
    const db = await makeReadyDb();
    await setSetting(db, VAULT_PATH_KEY, "/seeded");

    // A connector whose outcome flips between boot and retry.
    let outcome: ConnectResult = unavailableResult("missing");
    const connect: VaultConnector = () => Promise.resolve(outcome);

    renderWithVault({
      children: <Harness />,
      picker: neverPicker,
      connect,
      initialize: () => Promise.resolve(db),
    });

    await screen.findByText("unavailable");

    outcome = readyResult(2); // the folder becomes reachable again
    await userEvent.click(screen.getByText("retry"));

    await screen.findByText("ready");
    expect(screen.getByTestId("count").textContent).toBe("2");
  });
});

describe("VaultProvider — change the vault (US3 · FR-006)", () => {
  it("changes to a different folder and persists; re-choosing the same path is idempotent", async () => {
    const db = await makeReadyDb();
    await setSetting(db, VAULT_PATH_KEY, "/old");
    renderWithVault({
      children: <Harness />,
      picker: fakePicker("/new"),
      connect: fakeConnector({ fallback: readyResult(1) }),
      initialize: () => Promise.resolve(db),
    });

    await screen.findByText("ready");
    expect(screen.getByTestId("path").textContent).toBe("/old");

    await userEvent.click(screen.getByText("choose")); // change → "/new"
    await screen.findByText("/new");
    expect(await getSetting(db, VAULT_PATH_KEY)).toBe("/new");

    // Idempotent: re-choosing the now-active path keeps it ready, unchanged.
    await userEvent.click(screen.getByText("choose"));
    await screen.findByText("/new");
    expect(screen.getByTestId("status").textContent).toBe("ready");
  });
});
