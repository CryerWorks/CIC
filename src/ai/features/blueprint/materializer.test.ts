// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { NodeSqlExecutor } from "../../../db/adapters/node";
import { migrate, attachVault, listCourses, listMilestonesByCourse, listCardsByCourse } from "../../../db";
import { makeTempVault, type TempVault } from "../../../vault/test-support";
import { materializeBlueprint, MaterializationError, type MaterializerDeps } from "./materializer";
import type { CourseBlueprint, BlueprintTarget } from "./types";

const VID = "vault-1";

const vaults: TempVault[] = [];
function tempVault(): TempVault {
  const v = makeTempVault();
  vaults.push(v);
  return v;
}
afterEach(() => {
  for (const v of vaults.splice(0)) v.cleanup();
});

const target: BlueprintTarget = {
  topic: "Real Analysis",
  scope: "course",
  depth: "working",
  domainName: "Mathematics",
};

function makeBlueprint(overrides: Partial<CourseBlueprint> = {}): CourseBlueprint {
  return {
    title: "Real Analysis",
    domain: "Mathematics",
    target,
    milestones: [
      { order: 0, capability: "Define limits using epsilon-delta", description: "Epsilon-delta proofs", difficulty: 2 },
      { order: 1, capability: "Prove continuity of functions", description: "Continuous functions", difficulty: 3 },
    ],
    cardSeeds: [
      { front: "What is the epsilon-delta definition of a limit?", milestoneIndex: 0 },
      { front: "What does it mean for a function to be continuous?", milestoneIndex: 1 },
    ],
    retrievalQs: [
      { question: "How do you prove a limit exists?", milestoneIndex: 0, answerSnippet: "Use epsilon-delta" },
    ],
    feynmanTargets: [
      { concept: "Intermediate Value Theorem", milestoneIndex: 1 },
    ],
    resourceMap: [],
    ...overrides,
  };
}

describe("materializeBlueprint", () => {
  it("materializes a blueprint into domain + course + milestones + cards + MOC", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    const tv = tempVault();
    const deps: MaterializerDeps = {
      db,
      vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity },
      vaultId: VID,
    };

    const blueprint = makeBlueprint();
    const result = await materializeBlueprint(deps, blueprint);

    expect(result.status).toBe("materialized");
    expect(result.courseId).toBeTruthy();
    expect(result.mocPath).toBe("Courses/Real Analysis.md");
    expect(result.milestoneCount).toBe(2);
    expect(result.cardCount).toBe(2);

    // Verify SQLite rows
    const courses = await listCourses(db, VID);
    expect(courses).toHaveLength(1);
    expect(courses[0].title).toBe("Real Analysis");
    expect(courses[0].moc_path).toBe("Courses/Real Analysis.md");

    const milestones = await listMilestonesByCourse(db, result.courseId);
    expect(milestones).toHaveLength(2);
    expect(milestones[0].capability).toBe("Define limits using epsilon-delta");
    expect(milestones[1].capability).toBe("Prove continuity of functions");
    expect(milestones[0].order_index).toBe(0);
    expect(milestones[1].order_index).toBe(1);

    const cards = await listCardsByCourse(db, result.courseId);
    expect(cards).toHaveLength(2);
    // Cards are listed newest-first; check both exist regardless of insertion order
    const fronts = cards.map((c) => c.front).sort();
    expect(fronts).toEqual([
      "What does it mean for a function to be continuous?",
      "What is the epsilon-delta definition of a limit?",
    ]);
    // All cards have blank backs (scaffold-only)
    for (const card of cards) {
      expect(card.back).toBe("");
    }

    // Verify MOC exists
    const exists = await tv.reader.exists(result.mocPath);
    expect(exists).toBe(true);

    const note = await tv.reader.readNote(result.mocPath);
    expect(note.data["cic-type"]).toBe("course");
    expect(note.data["cic-id"]).toBe(result.courseId);
    expect(note.body).toContain("Define limits using epsilon-delta");
    expect(note.body).toContain("Prove continuity of functions");
  });

  it("creates the domain if it does not exist", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    const tv = tempVault();
    const deps: MaterializerDeps = {
      db,
      vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity },
      vaultId: VID,
    };

    const blueprint = makeBlueprint({ domain: "NewDomain" });
    const result = await materializeBlueprint(deps, blueprint);

    expect(result.status).toBe("materialized");

    // Domain should have been created
    const courses = await listCourses(db, VID);
    expect(courses).toHaveLength(1);
    expect(courses[0].title).toBe("Real Analysis");
  });

  it("handles blueprint with no card seeds", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    const tv = tempVault();
    const deps: MaterializerDeps = {
      db,
      vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity },
      vaultId: VID,
    };

    const blueprint = makeBlueprint({ cardSeeds: [] });
    const result = await materializeBlueprint(deps, blueprint);

    expect(result.status).toBe("materialized");
    expect(result.cardCount).toBe(0);

    const cards = await listCardsByCourse(db, result.courseId);
    expect(cards).toHaveLength(0);
  });

  it("handles blueprint with single milestone", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    const tv = tempVault();
    const deps: MaterializerDeps = {
      db,
      vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity },
      vaultId: VID,
    };

    const blueprint = makeBlueprint({
      milestones: [{ order: 0, capability: "Single milestone", description: "Just one", difficulty: 1 }],
      cardSeeds: [],
      retrievalQs: [],
      feynmanTargets: [],
    });

    const result = await materializeBlueprint(deps, blueprint);
    expect(result.milestoneCount).toBe(1);

    const milestones = await listMilestonesByCourse(db, result.courseId);
    expect(milestones).toHaveLength(1);
    expect(milestones[0].capability).toBe("Single milestone");
  });

  it("throws when domain creation fails (e.g. closed DB)", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    const tv = tempVault();

    // Close the DB to simulate failure
    db.close();

    const deps: MaterializerDeps = {
      db,
      vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity },
      vaultId: VID,
    };

    const blueprint = makeBlueprint();
    await expect(materializeBlueprint(deps, blueprint)).rejects.toThrow(MaterializationError);
  });

  it("sets all milestones to status 'todo'", async () => {
    const db = NodeSqlExecutor.open();
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    const tv = tempVault();
    const deps: MaterializerDeps = {
      db,
      vault: { reader: tv.reader, writer: tv.writer, identity: tv.identity },
      vaultId: VID,
    };

    const blueprint = makeBlueprint();
    const result = await materializeBlueprint(deps, blueprint);

    const milestones = await listMilestonesByCourse(db, result.courseId);
    for (const m of milestones) {
      expect(m.status).toBe("todo");
    }
  });
});
