import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { DashboardRoute } from "./DashboardRoute";
import {
  renderWithVault,
  fakeConnector,
  readyResult,
} from "../../app/providers/vault/test-support";
import { makeReadyDb } from "../../app/test-support";
import {
  setSetting,
  createDomain,
  createCourse,
  createMilestone,
  type SqlExecutor,
  type MilestoneStatus,
} from "../../db";
import { VAULT_PATH_KEY } from "../../app/providers/vault/keys";

/** A ready (vault-path set) store, seeded via `seed`. */
async function seededDb(seed: (db: SqlExecutor) => Promise<void>): Promise<SqlExecutor> {
  const db = await makeReadyDb();
  await setSetting(db, VAULT_PATH_KEY, "/seeded/vault");
  await seed(db);
  return db;
}

async function addMilestones(db: SqlExecutor, courseId: string, status: MilestoneStatus, n: number, from = 0) {
  for (let i = 0; i < n; i += 1) {
    await createMilestone(db, { courseId, capability: `${status} ${i}`, orderIndex: from + i, status });
  }
}

/** Math (Real Analysis: 12 done, MOC) + CS (Algorithms: 6 in-progress, 12 todo) → 30 milestones, 40% done. */
async function seedTwoDomains(db: SqlExecutor) {
  const math = await createDomain(db, { name: "Math", color: "#8b6cef" });
  const cs = await createDomain(db, { name: "CS", color: "#00bfbc" });
  const ra = await createCourse(db, { title: "Real Analysis", domainId: math.id, mocPath: "Courses/Real Analysis.md" });
  await addMilestones(db, ra.id, "done", 12);
  const algo = await createCourse(db, { title: "Algorithms", domainId: cs.id });
  await addMilestones(db, algo.id, "in-progress", 6);
  await addMilestones(db, algo.id, "todo", 12, 6);
}

describe("DashboardRoute — vault status (FR-008)", () => {
  it("shows the 'choose your vault' banner when no vault is connected", async () => {
    renderWithVault({ children: <DashboardRoute />, connect: fakeConnector({ fallback: readyResult(0) }) });
    expect(await screen.findByText(/no vault connected/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /choose your vault/i }).getAttribute("href")).toBe("/vault");
  });

  it("hides the banner and shows a 'Vault connected' indicator once a vault is ready (C2)", async () => {
    const db = await seededDb(seedTwoDomains);
    renderWithVault({
      children: <DashboardRoute />,
      connect: fakeConnector({ fallback: readyResult(0) }),
      initialize: () => Promise.resolve(db),
    });
    expect(await screen.findByText(/vault connected/i)).toBeTruthy();
    expect(screen.queryByText(/no vault connected/i)).toBeNull();
  });
});

describe("DashboardRoute — real summary (US1 · SC-001/SC-002)", () => {
  it("renders real totals and milestone progress (12/30 → 40%)", async () => {
    const db = await seededDb(seedTwoDomains);
    renderWithVault({ children: <DashboardRoute />, initialize: () => Promise.resolve(db) });

    expect(await screen.findByText("Command Center")).toBeTruthy();
    expect(screen.getByText("Milestones")).toBeTruthy(); // a totals StatCell label (unique)
    expect(screen.getByText("30")).toBeTruthy(); // milestone total
    expect(screen.getByText(/40%/)).toBeTruthy(); // 12 of 30 done
  });

  it("renders a Course with no milestones without NaN%", async () => {
    const db = await seededDb(async (d) => {
      const dom = await createDomain(d, { name: "Math", color: "#8b6cef" });
      await createCourse(d, { title: "Empty", domainId: dom.id });
    });
    renderWithVault({ children: <DashboardRoute />, initialize: () => Promise.resolve(db) });

    expect(await screen.findByText(/no milestones yet/i)).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});

describe("DashboardRoute — allocation & navigation (US2 · FR-003/FR-004)", () => {
  it("shows per-domain allocation incl. a zero-course domain", async () => {
    const db = await seededDb(async (d) => {
      const math = await createDomain(d, { name: "Math", color: "#8b6cef" });
      await createDomain(d, { name: "Zoology", color: "#ffaa00" }); // no courses
      await createCourse(d, { title: "Real Analysis", domainId: math.id });
    });
    renderWithVault({ children: <DashboardRoute />, initialize: () => Promise.resolve(db) });

    expect(await screen.findByText("Zoology")).toBeTruthy(); // still listed
    expect(screen.getByText(/0 courses/)).toBeTruthy();
  });

  it("links a Course to /courses and tags those with a MOC", async () => {
    const db = await seededDb(seedTwoDomains);
    renderWithVault({ children: <DashboardRoute />, initialize: () => Promise.resolve(db) });

    const link = await screen.findByRole("link", { name: /Real Analysis/i });
    expect(link.getAttribute("href")).toBe("/courses");
    expect(screen.getByText("MOC")).toBeTruthy(); // Real Analysis has a moc_path
  });
});

describe("DashboardRoute — onboarding & honest tiles (US3 · SC-003/SC-004 · Constitution III)", () => {
  it("guides a brand-new user to create a Domain instead of a zero grid", async () => {
    renderWithVault({ children: <DashboardRoute />, connect: fakeConnector({ fallback: readyResult(0) }) });

    expect(await screen.findByText(/welcome to cic/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /create your first domain/i }).getAttribute("href")).toBe("/domains");
    expect(screen.queryByText("Command Center")).toBeNull(); // no zero-grid headline
  });

  it("shows the retention tiles as labeled 'Phase 2' placeholders with no fabricated data", async () => {
    const db = await seededDb(seedTwoDomains);
    renderWithVault({ children: <DashboardRoute />, initialize: () => Promise.resolve(db) });

    await screen.findByText("Command Center");
    expect(screen.getAllByText("Phase 2").length).toBe(5); // streak/protocol/heatmap/sessions/due-cards
    expect(screen.getByText(/current streak/i)).toBeTruthy();
    expect(screen.queryByText(/learned/i)).toBeNull(); // nothing claims mastery
  });
});
