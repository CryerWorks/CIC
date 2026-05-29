import { describe, it, expect, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithVault, fakeConnector, readyResult } from "../../app/providers/vault/test-support";
import { makeReadyDb } from "../../app/test-support";
import { NotifierProvider } from "../../notifications/NotifierProvider";
import type { Notifier } from "../../notifications/notifier";
import { ReminderScheduler } from "./ReminderScheduler";
import { setReminderEnabled, setReminderTime, markReminderFired, getReminderConfig } from "./config";
import {
  setSetting,
  attachVault,
  createDomain,
  createCourse,
  planSession,
  finalizeSession,
  type SqlExecutor,
} from "../../db";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";

const VID = "vault-sched";
const today = () => new Date().toISOString().slice(0, 10);

function fakeNotifier(granted = true): Notifier {
  return {
    isPermissionGranted: vi.fn().mockResolvedValue(granted),
    requestPermission: vi.fn().mockResolvedValue(granted ? "granted" : "denied"),
    notify: vi.fn().mockResolvedValue(undefined),
  };
}

async function seededDb(): Promise<{ db: SqlExecutor; courseId: string }> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded");
  await attachVault(db, { id: VID, path: "/seeded" });
  const dom = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Real Analysis", domainId: dom.id });
  // Reminder time 00:00 so the real wall-clock `now` is always at/after it (the time-of-day rule
  // is covered by the pure schedule tests); this avoids an injected-now vs real-timestamp mismatch.
  await setReminderEnabled(db, true);
  await setReminderTime(db, 0, 0);
  return { db, courseId: course.id };
}

function renderScheduler(db: SqlExecutor, notifier: Notifier) {
  return renderWithVault({
    initialize: () => Promise.resolve(db),
    connect: fakeConnector({ fallback: readyResult(0, VID) }),
    children: (
      <NotifierProvider notifier={notifier}>
        <ReminderScheduler intervalMs={100000} />
      </NotifierProvider>
    ),
  });
}

/** Let the async check run to completion (it calls isPermissionGranted, then counts, then decides).
 *  Generous timeout + flush so it stays deterministic under heavy parallel suite load. */
async function settle(notifier: Notifier) {
  await waitFor(() => expect(notifier.isPermissionGranted).toHaveBeenCalled(), { timeout: 4000 });
  await new Promise((r) => setTimeout(r, 150));
}

describe("ReminderScheduler (US2/US3 / Feature 014)", () => {
  it("fires one native reminder when enabled, permitted, with pending work and not practiced", async () => {
    const { db, courseId } = await seededDb();
    await planSession(db, { courseId, objective: "Pending", assignments: [], pretestQuestions: [], cardDrafts: [] });
    const notifier = fakeNotifier(true);

    renderScheduler(db, notifier);

    await waitFor(() => expect(notifier.notify).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect((notifier.notify as ReturnType<typeof vi.fn>).mock.calls[0][0].body).toMatch(/session/);
    await waitFor(async () => expect((await getReminderConfig(db)).lastFired).toBe(today()), { timeout: 4000 });
  });

  it("does not fire a second time once it has fired today (FR-008)", async () => {
    const { db, courseId } = await seededDb();
    await planSession(db, { courseId, objective: "Pending", assignments: [], pretestQuestions: [], cardDrafts: [] });
    await markReminderFired(db, today()); // already fired
    const notifier = fakeNotifier(true);

    renderScheduler(db, notifier);
    await settle(notifier);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("does not fire when OS permission is not granted (SC-005)", async () => {
    const { db, courseId } = await seededDb();
    await planSession(db, { courseId, objective: "Pending", assignments: [], pretestQuestions: [], cardDrafts: [] });
    const notifier = fakeNotifier(false);

    renderScheduler(db, notifier);
    await settle(notifier);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("does not fire when there is no pending work (FR-006/SC-004)", async () => {
    const { db } = await seededDb(); // no planned sessions, no due cards
    const notifier = fakeNotifier(true);

    renderScheduler(db, notifier);
    await settle(notifier);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("is suppressed once the learner has practiced today (US3 / FR-010/SC-003)", async () => {
    const { db, courseId } = await seededDb();
    await planSession(db, { courseId, objective: "Still pending", assignments: [], pretestQuestions: [], cardDrafts: [] });
    const done = await planSession(db, { courseId, objective: "Done today", assignments: [], pretestQuestions: [], cardDrafts: [] });
    await finalizeSession(db, { sessionId: done.id, minutes: 5, didRetrieval: false, writeupPath: null, pretestAnswers: [], cards: [] });
    const notifier = fakeNotifier(true);

    renderScheduler(db, notifier);
    await settle(notifier);
    expect(notifier.notify).not.toHaveBeenCalled();
  });
});
