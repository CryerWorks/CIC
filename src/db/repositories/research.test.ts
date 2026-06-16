// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import {
  createResearchSource,
  getResearchSource,
  getResearchSourcesByVault,
  saveLearningProfile,
  getLearningProfilesByVault,
  getLatestLearningProfileByVault,
} from "./research";

const VID = "vault-research-test";
const tempFiles: string[] = [];

function tempDbPath(): string {
  const path = join(tmpdir(), `cic-research-test-${crypto.randomUUID()}.db`);
  tempFiles.push(path);
  return path;
}

afterEach(() => {
  for (const f of tempFiles.splice(0)) {
    try {
      rmSync(f, { force: true });
    } catch {
      // Windows may hold temp files briefly — ignore cleanup errors
    }
  }
});

describe("research_sources repository", () => {
  it("creates and reads a research source", async () => {
    const db = NodeSqlExecutor.open(tempDbPath());
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });

    const source = await createResearchSource(db, {
      vaultId: VID,
      url: "https://example.com/course",
      title: "Test Course",
      sourceType: "courseware",
    });

    expect(source.id).toBeTruthy();
    expect(source.url).toBe("https://example.com/course");
    expect(source.title).toBe("Test Course");
    expect(source.source_type).toBe("courseware");
    expect(source.quality_score).toBeNull();

    const read = await getResearchSource(db, source.id);
    expect(read).not.toBeNull();
    expect(read!.url).toBe("https://example.com/course");
  });

  it("lists research sources by vault", async () => {
    const db = NodeSqlExecutor.open(tempDbPath());
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });

    await createResearchSource(db, { vaultId: VID, url: "https://a.com", title: "A" });
    await createResearchSource(db, { vaultId: VID, url: "https://b.com", title: "B" });

    const sources = await getResearchSourcesByVault(db, VID);
    expect(sources).toHaveLength(2);
  });

  it("scopes sources to vault", async () => {
    const db = NodeSqlExecutor.open(tempDbPath());
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });
    await attachVault(db, { id: "other-vault", path: "/other" });

    await createResearchSource(db, { vaultId: VID, url: "https://a.com", title: "A" });
    await createResearchSource(db, { vaultId: "other-vault", url: "https://b.com", title: "B" });

    const sources = await getResearchSourcesByVault(db, VID);
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("A");
  });

  it("respects ON DELETE CASCADE when vault is deleted", async () => {
    const db = NodeSqlExecutor.open(tempDbPath());
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });

    await createResearchSource(db, { vaultId: VID, url: "https://a.com", title: "A" });

    // Delete vault should cascade
    await db.execute("DELETE FROM vaults WHERE id = ?", [VID]);

    const sources = await getResearchSourcesByVault(db, VID);
    expect(sources).toHaveLength(0);
  });
});

describe("learning_profiles repository", () => {
  it("saves and reads a learning profile", async () => {
    const db = NodeSqlExecutor.open(tempDbPath());
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });

    const profile = await saveLearningProfile(db, {
      vaultId: VID,
      domain: "Physics",
      declaredLevel: "intermediate",
      knowledgeText: "I know classical mechanics",
      timeBudget: "10 hours/week",
      depthGoal: "mastery",
    });

    expect(profile.id).toBeTruthy();
    expect(profile.domain).toBe("Physics");
    expect(profile.declared_level).toBe("intermediate");
    expect(profile.depth_goal).toBe("mastery");

    const profiles = await getLearningProfilesByVault(db, VID);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].domain).toBe("Physics");
  });

  it("getLatestLearningProfileByVault returns most recent", async () => {
    const db = NodeSqlExecutor.open(tempDbPath());
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });

    await saveLearningProfile(db, {
      vaultId: VID,
      domain: "Math",
      declaredLevel: "beginner",
      knowledgeText: "Basic algebra",
      timeBudget: "5 hours/week",
      depthGoal: "working",
    });

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));

    await saveLearningProfile(db, {
      vaultId: VID,
      domain: "Physics",
      declaredLevel: "intermediate",
      knowledgeText: "Some physics",
      timeBudget: "10 hours/week",
      depthGoal: "mastery",
    });

    const latest = await getLatestLearningProfileByVault(db, VID);
    expect(latest).not.toBeNull();
    expect(latest!.domain).toBe("Physics");
  });

  it("returns empty array for vault with no profiles", async () => {
    const db = NodeSqlExecutor.open(tempDbPath());
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });

    const profiles = await getLearningProfilesByVault(db, VID);
    expect(profiles).toEqual([]);

    const latest = await getLatestLearningProfileByVault(db, VID);
    expect(latest).toBeNull();
  });

  it("respects ON DELETE CASCADE when vault is deleted", async () => {
    const db = NodeSqlExecutor.open(tempDbPath());
    await migrate(db);
    await attachVault(db, { id: VID, path: "/vault" });

    await saveLearningProfile(db, {
      vaultId: VID,
      domain: "Physics",
      declaredLevel: "beginner",
      knowledgeText: "None",
      timeBudget: "5 hours",
      depthGoal: "overview",
    });

    await db.execute("DELETE FROM vaults WHERE id = ?", [VID]);

    const profiles = await getLearningProfilesByVault(db, VID);
    expect(profiles).toEqual([]);
  });
});
