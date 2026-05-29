import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, makeReadyDb } from "../../app/test-support";
import { fakeConnector, readyResult } from "../../app/providers/vault/test-support";
import {
  setSetting,
  attachVault,
  registerResource,
  createDomain,
  createCourse,
  listCourseResources,
  listResources,
  type SqlExecutor,
} from "../../db";
import type { SourceFiles } from "./sourceFiles";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";

const VID = "vault-res";

async function seed(fn?: (db: SqlExecutor) => Promise<void>): Promise<SqlExecutor> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded");
  await attachVault(db, { id: VID, path: "/seeded" });
  if (fn) await fn(db);
  return db;
}

function renderRes(db: SqlExecutor, sourceFiles?: SourceFiles) {
  return renderApp({
    initialEntries: ["/resources"],
    initialize: () => Promise.resolve(db),
    connect: fakeConnector({ fallback: readyResult(0, VID) }),
    sourceFiles,
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

  it("internalizes a picked file and records its stored path (US1)", async () => {
    const fake: SourceFiles = {
      pickFile: () => Promise.resolve("/picked/baby-rudin.pdf"),
      importFile: ({ resourceId, filename }) => Promise.resolve(`/store/resources/${resourceId}/${filename}`),
      removeFiles: () => Promise.resolve(),
    };
    const db = await seed();
    renderRes(db, fake);

    await userEvent.click(await screen.findByRole("button", { name: "Register resource" }));
    await userEvent.type(screen.getByLabelText("Title"), "Baby Rudin");
    // Kind defaults to PDF (a file-kind) → the native picker control is shown.
    await userEvent.click(screen.getByRole("button", { name: "Choose file…" }));
    expect(await screen.findByText(/Selected: baby-rudin\.pdf/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(async () => {
      const rows = await listResources(db, VID);
      expect(rows).toHaveLength(1);
      expect(rows[0].file_path).toMatch(/\/store\/resources\/.+\/baby-rudin\.pdf$/);
    });
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

  it("links a course to a resource from the edit form (course linking is available on edit)", async () => {
    let courseId = "";
    const db = await seed(async (d) => {
      const dom = await createDomain(d, VID, { name: "Math", color: "#8b6cef" });
      const course = await createCourse(d, { title: "Real Analysis", domainId: dom.id });
      courseId = course.id;
      await registerResource(d, VID, { title: "Baby Rudin", kind: "book" });
    });
    renderRes(db);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const addCourse = await screen.findByLabelText("Add a course");
    await userEvent.selectOptions(addCourse, within(addCourse).getByRole("option", { name: "Real Analysis" }));
    expect(await screen.findByRole("button", { name: "Unlink Real Analysis" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Save resource" }));

    await waitFor(async () => {
      const linked = await listCourseResources(db, courseId);
      expect(linked.map((r) => r.title)).toContain("Baby Rudin");
    });
  });

  it("files a Resource under a Domain on edit and filters the registry by it (US4)", async () => {
    const db = await seed(async (d) => {
      await createDomain(d, VID, { name: "Math", color: "#8b6cef" });
      await registerResource(d, VID, { title: "Baby Rudin", kind: "book" });
      await registerResource(d, VID, { title: "Other Book", kind: "book" });
    });
    renderRes(db);

    await screen.findByText("Baby Rudin");
    // Edit the first row (alphabetical: "Baby Rudin") → set its Home domain → save.
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await userEvent.selectOptions(await screen.findByLabelText("Home domain"), "Math");
    await userEvent.click(screen.getByRole("button", { name: "Save resource" }));

    // Filter the registry to Math → only the filed resource remains.
    await screen.findByText("Baby Rudin");
    await userEvent.selectOptions(screen.getByLabelText("Filter by domain"), "Math");
    await waitFor(() => {
      expect(screen.getByText("Baby Rudin")).toBeTruthy();
      expect(screen.queryByText("Other Book")).toBeNull();
    });
  });

  it("deletes a resource", async () => {
    const db = await seed((d) => registerResource(d, VID, { title: "Gone", kind: "pdf" }).then(() => {}));
    renderRes(db);

    await screen.findByText("Gone");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Gone")).toBeNull());
  });

  it("removes the internalized file copy when a Resource is deleted (US3)", async () => {
    let removedId = "";
    const fake: SourceFiles = {
      pickFile: () => Promise.resolve(null),
      importFile: ({ resourceId, filename }) => Promise.resolve(`/store/${resourceId}/${filename}`),
      removeFiles: (id) => {
        removedId = id;
        return Promise.resolve();
      },
    };
    let resId = "";
    const db = await seed(async (d) => {
      const r = await registerResource(d, VID, { title: "Gone", kind: "pdf" });
      resId = r.id;
    });
    renderRes(db, fake);

    await screen.findByText("Gone");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Gone")).toBeNull());
    expect(removedId).toBe(resId);
  });
});
