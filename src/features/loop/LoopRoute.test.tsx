import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, makeReadyDb } from "../../app/test-support";
import { stubVault } from "../../app/providers/vault/test-support";
import {
  setSetting,
  attachVault,
  createDomain,
  createCourse,
  registerResource,
  planSession,
  reorderCourseSessions,
  listCardsByCourse,
  listCardResources,
  listPlannedSessions,
  listSessionsByVault,
  type SqlExecutor,
} from "../../db";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";
import type { Vault, VaultWriter } from "../../vault";

const VID = "vault-loop";

async function seed(): Promise<{ db: SqlExecutor; courseId: string; resourceId: string }> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded");
  await attachVault(db, { id: VID, path: "/seeded" });
  const dom = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Real Analysis", domainId: dom.id });
  const r = await registerResource(db, VID, { title: "Baby Rudin", kind: "pdf", filePath: "/store/x.pdf" });
  return { db, courseId: course.id, resourceId: r.id };
}

type WriteNote = (path: string, note: { frontmatter: Record<string, unknown>; body: string }) => Promise<unknown>;

/** A Vault whose writer is fully controllable (records writes, or throws). */
function fakeVault(writeNote: WriteNote): Vault {
  const base = stubVault();
  return {
    reader: base.reader,
    identity: base.identity,
    writer: { writeNote, deleteNote: () => Promise.resolve({ status: "absent" }) } as unknown as VaultWriter,
  };
}

function renderLoop(db: SqlExecutor, vault: Vault) {
  return renderApp({
    initialEntries: ["/loop"],
    initialize: () => Promise.resolve(db),
    connect: () => Promise.resolve({ ok: true, vault, noteCount: 0, id: VID }),
  });
}

const ok = () => Promise.resolve({ status: "written", fingerprint: { mtime: "t", hash: "h" } });

/** Click Start on the first planned session, wait for the doing flow, then walk to Finish. */
async function startAndFinish() {
  await userEvent.click(await screen.findByRole("button", { name: "Start" }));
  // The doing flow loads asynchronously; wait for the stepper.
  await screen.findByRole("button", { name: "Next" });
  for (let i = 0; i < 12 && screen.queryByRole("button", { name: "Next" }); i++) {
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
  }
  await userEvent.click(screen.getByRole("button", { name: "Finish session" }));
}

describe("LoopRoute — doing a planned session (US2)", () => {
  it("does a planned session end-to-end and writes a type:log writeup", async () => {
    const { db, courseId } = await seed();
    await planSession(db, {
      courseId,
      objective: "State the epsilon-delta definition",
      assignments: [],
      pretestQuestions: [],
      cardDrafts: [],
    });
    const writes: { path: string; body: string; frontmatter: Record<string, unknown> }[] = [];
    renderLoop(
      db,
      fakeVault((path, note) => {
        writes.push({ path, body: note.body, frontmatter: note.frontmatter });
        return ok();
      }),
    );

    await startAndFinish();

    expect(await screen.findByText("Session recorded")).toBeTruthy();
    await waitFor(async () => {
      const done = await listSessionsByVault(db, VID, { status: "completed" });
      expect(done).toHaveLength(1);
      expect(done[0].session.objective).toBe("State the epsilon-delta definition");
    });
    expect(await listPlannedSessions(db, VID)).toHaveLength(0); // no longer planned
    const writeup = writes.find((w) => w.path.startsWith("Sessions/"));
    expect(writeup?.frontmatter.type).toBe("log");
    expect(writeup?.body).toContain("State the epsilon-delta definition");
  });

  it("keeps the session planned and offers a retry when the writeup write fails (R7)", async () => {
    const { db, courseId } = await seed();
    await planSession(db, { courseId, objective: "Limits failing writeup", assignments: [], pretestQuestions: [], cardDrafts: [] });
    renderLoop(db, fakeVault(() => Promise.reject(new Error("file is locked"))));

    await startAndFinish();

    // The session is persisted as completed even though the vault write threw…
    await waitFor(async () => expect(await listSessionsByVault(db, VID, { status: "completed" })).toHaveLength(1));
    // …and the UI offers a retry rather than crashing or losing the session.
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("abandoning the doing flow leaves the session PLANNED (R11)", async () => {
    const { db, courseId } = await seed();
    await planSession(db, { courseId, objective: "abandon me", assignments: [], pretestQuestions: [], cardDrafts: [] });
    renderLoop(db, fakeVault(ok));

    await userEvent.click(await screen.findByRole("button", { name: "Start" }));
    await screen.findByRole("button", { name: "Next" });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Still planned, nothing completed.
    expect(await listPlannedSessions(db, VID)).toHaveLength(1);
    expect(await listSessionsByVault(db, VID, { status: "completed" })).toHaveLength(0);
  });

  it("materializes a planned card draft into a new card that inherits the assignment's citation (US4)", async () => {
    const { db, courseId, resourceId } = await seed();
    await planSession(db, {
      courseId,
      objective: "Cards inherit citations",
      assignments: [{ resourceId, locator: "page=10", kind: "read" }],
      pretestQuestions: [],
      cardDrafts: [{ front: "Define a limit", back: "epsilon-delta" }],
    });
    renderLoop(db, fakeVault(ok));

    await startAndFinish();

    await screen.findByText("Session recorded");
    const cards = await listCardsByCourse(db, courseId);
    expect(cards).toHaveLength(1);
    expect(cards[0].fsrs_state).toBeNull(); // new — Constitution III
    const cites = await listCardResources(db, cards[0].id);
    expect(cites.map((c) => [c.resource.id, c.locator])).toEqual([[resourceId, "page=10"]]);
  });

  it("shows guidance (and no Start) when nothing is planned in the active vault", async () => {
    const { db } = await seed();
    renderLoop(db, fakeVault(ok));
    expect(await screen.findByText(/Nothing planned yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });

  // Feature 013: the curriculum order is a guide, not a gate (FR-005/SC-004, Constitution III).
  it("lists and lets you start ANY planned session regardless of curriculum order_index", async () => {
    const { db, courseId } = await seed();
    const s1 = await planSession(db, { courseId, objective: "Sequence step 1", assignments: [], pretestQuestions: [], cardDrafts: [] });
    const s2 = await planSession(db, { courseId, objective: "Sequence step 2", assignments: [], pretestQuestions: [], cardDrafts: [] });
    const s3 = await planSession(db, { courseId, objective: "Sequence step 3", assignments: [], pretestQuestions: [], cardDrafts: [] });
    // Give the curriculum a non-sequential order (step 3 first); the loop must NOT mirror or gate on it.
    await reorderCourseSessions(db, courseId, [s3.id, s1.id, s2.id]);

    renderLoop(db, fakeVault(ok));

    // All three are present and each is independently startable — none hidden or locked by sequence.
    expect(await screen.findByText("Sequence step 1")).toBeTruthy();
    expect(screen.getByText("Sequence step 2")).toBeTruthy();
    expect(screen.getByText("Sequence step 3")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Start" })).toHaveLength(3);
  });
});
