// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createNodeVectorStore } from "../adapters/rag/node";
import { createRetriever } from "./retriever";
import { hashContent } from "./hashing";
import { m0009Rag } from "../../db/migrations/m0009_rag";
import type { AIRouter } from "../router";
import type { VectorStore } from "./vectorStore";
import type { ChunkInput } from "./types";

const VID = "v-test";

const STUB_SCHEMA = `
CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT,
  url TEXT,
  ingested_at TEXT,
  domain_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO vaults (id, path) VALUES ('${VID}', '/v1');
`;

function fakeRouter(embedFn = fakeEmbedder()): AIRouter {
  return {
    embed: embedFn as AIRouter["embed"],
    chat: () => { throw new Error("not used"); },
    probe: () => { throw new Error("not used"); },
  } as unknown as AIRouter;
}

function fakeEmbedder(dim = 4): AIRouter["embed"] {
  return async (_role, texts) => {
    const vectors = texts.map((t, i) => {
      const vec = new Array(dim).fill(0).map((_, j) => (t.length * 0.01 + i * 0.1 + j * 0.001) % 1);
      return vec;
    });
    return { vectors, model: "test-embedder", dimensions: dim };
  };
}

async function makeChunk(overrides: Partial<ChunkInput> = {}): Promise<ChunkInput> {
  return {
    id: overrides.id ?? "c-001",
    vaultId: overrides.vaultId ?? VID,
    sourceKind: overrides.sourceKind ?? "resource",
    sourceId: overrides.sourceId ?? "r-smoke",
    sourceTitle: overrides.sourceTitle ?? "Test",
    chunkIndex: overrides.chunkIndex ?? 0,
    headingPath: overrides.headingPath ?? null,
    textContent: overrides.textContent ?? "test",
    contentHash: overrides.contentHash ?? await hashContent(overrides.textContent ?? "test"),
    charOffsetStart: overrides.charOffsetStart ?? 0,
    charOffsetEnd: overrides.charOffsetEnd ?? 4,
    embedding: overrides.embedding ?? new Float32Array([0.1, 0.2, 0.3, 0.4]),
  };
}

function setup(): { db: Database.Database; store: VectorStore } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(STUB_SCHEMA);
  db.exec(m0009Rag.sql);
  const store = createNodeVectorStore(db);
  return { db, store };
}

describe("retriever", () => {
  let db: Database.Database;
  let store: VectorStore;

  beforeEach(async () => {
    const s = setup();
    db = s.db;
    store = s.store;
    await store.init();
  });

  afterEach(() => {
    db.close();
  });

  it("returns empty array for empty corpus", async () => {
    const retriever = createRetriever(fakeRouter(), store);
    const results = await retriever.search("anything", 3, VID);
    expect(results).toEqual([]);
  });

  it("returns top-k chunks from a single source", async () => {
    const r1Id = "r-calc";
    db.exec(`INSERT OR IGNORE INTO resources (id, title, kind, vault_id) VALUES ('${r1Id}', 'Calculus 101', 'markdown', '${VID}')`);
    await store.insertChunks([await makeChunk({ id: "c1", sourceId: r1Id, sourceTitle: "Calculus 101", textContent: "Limits are fundamental." })]);

    const retriever = createRetriever(fakeRouter(), store);
    const results = await retriever.search("tell me about limits", 3, VID);

    expect(results.length).toBe(1);
    expect(results[0].chunk.source_kind).toBe("resource");
    expect(results[0].chunk.source_title).toBe("Calculus 101");
  });

  it("returns top-k from a specific source filter", async () => {
    const r1Id = "r-physics";
    db.exec(`INSERT OR IGNORE INTO resources (id, title, kind, vault_id) VALUES ('${r1Id}', 'Physics', 'markdown', '${VID}')`);
    await store.insertChunks([await makeChunk({ id: "c2", sourceId: r1Id, sourceTitle: "Physics", textContent: "F = ma" })]);

    const retriever = createRetriever(fakeRouter(), store);
    const results = await retriever.search("force", 3, VID, { sourceKind: "resource" });

    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.chunk.source_kind).toBe("resource");
    }
  });

  it("vault scoping isolates results", async () => {
    const VID2 = "v-other";
    db.exec(`INSERT OR IGNORE INTO vaults (id, path) VALUES ('${VID2}', '/v2')`);
    const r2Id = "r-vault2";
    db.exec(`INSERT OR IGNORE INTO resources (id, title, kind, vault_id) VALUES ('${r2Id}', 'Vault 2 Resource', 'markdown', '${VID2}')`);
    await store.insertChunks([await makeChunk({ id: "c3", vaultId: VID2, sourceId: r2Id, sourceTitle: "Vault 2 Resource", textContent: "Secret content." })]);

    const retriever = createRetriever(fakeRouter(), store);
    const resultsV1 = await retriever.search("secret", 5, VID);
    expect(resultsV1).toEqual([]);

    const resultsV2 = await retriever.search("secret", 5, VID2);
    expect(resultsV2.length).toBe(1);
  });

  it("returns getSourceStats grouped by source", async () => {
    const r1Id = "r-stats";
    db.exec(`INSERT OR IGNORE INTO resources (id, title, kind, vault_id) VALUES ('${r1Id}', 'Stats Book', 'markdown', '${VID}')`);
    await store.insertChunks([await makeChunk({ id: "c4", sourceId: r1Id, sourceTitle: "Stats Book", textContent: "Stats content." })]);

    const retriever = createRetriever(fakeRouter(), store);
    const stats = await retriever.getSourceStats(VID);
    expect(Array.isArray(stats)).toBe(true);
    expect(stats.length).toBeGreaterThanOrEqual(1);
    for (const s of stats) {
      expect(s).toHaveProperty("sourceKind");
      expect(s).toHaveProperty("sourceTitle");
      expect(s).toHaveProperty("chunkCount");
    }
  });
});
