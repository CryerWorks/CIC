import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, makeReadyDb } from "../../app/test-support";
import { fakeConnector, readyResult } from "../../app/providers/vault/test-support";
import { setSetting, attachVault, registerResource, type SqlExecutor } from "../../db";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";

const VID = "vault-res";

async function seed(fn?: (db: SqlExecutor) => Promise<void>): Promise<SqlExecutor> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded");
  await attachVault(db, { id: VID, path: "/seeded" });
  if (fn) await fn(db);
  return db;
}

function renderRes(db: SqlExecutor) {
  return renderApp({
    initialEntries: ["/resources"],
    initialize: () => Promise.resolve(db),
    connect: fakeConnector({ fallback: readyResult(0, VID) }),
  });
}

describe("ResourcesRoute (US4)", () => {
  it("registers a Resource with kind-specific metadata", async () => {
    const db = await seed();
    renderRes(db);

    await userEvent.click(await screen.findByRole("button", { name: "Register resource" }));
    await userEvent.type(screen.getByLabelText("Title"), "Baby Rudin");
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "book");
    await userEvent.type(screen.getByLabelText("Author"), "Walter Rudin");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("Baby Rudin")).toBeTruthy();
    expect(screen.getByText("Book")).toBeTruthy();
  });

  it("lists only the active vault's resources", async () => {
    const db = await seed(async (d) => {
      await registerResource(d, VID, { title: "In V1", kind: "pdf" });
      await attachVault(d, { id: "v2", path: "/v2" });
      await registerResource(d, "v2", { title: "In V2", kind: "pdf" });
    });
    renderRes(db);

    expect(await screen.findByText("In V1")).toBeTruthy();
    expect(screen.queryByText("In V2")).toBeNull();
  });

  it("deletes a resource", async () => {
    const db = await seed((d) => registerResource(d, VID, { title: "Gone", kind: "pdf" }).then(() => {}));
    renderRes(db);

    await screen.findByText("Gone");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Gone")).toBeNull());
  });
});
