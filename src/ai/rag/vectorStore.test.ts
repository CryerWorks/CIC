// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createNodeVectorStore } from "../adapters/rag/node";
import type { VectorStore } from "./vectorStore";
import type { ChunkInput } from "./types";
import { m0009Rag } from "../../db/migrations/m0009_rag";

const VAULT_ID = "v-test-01";
const RESOURCE_ID = "r-test-01";
const NOTE_ID = "math/chain-rule.md";
const NONEXISTENT_VAULT = "v-none";

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
INSERT OR IGNORE INTO vaults (id, path) VALUES ('${VAULT_ID}', '/test-vault');
INSERT OR IGNORE INTO resources (id, vault_id, kind, title) VALUES ('${RESOURCE_ID}', '${VAULT_ID}', 'markdown', 'Test Resource');
INSERT OR IGNORE INTO resources (id, vault_id, kind, title) VALUES ('r-1', '${VAULT_ID}', 'markdown', 'Resource 1');
INSERT OR IGNORE INTO resources (id, vault_id, kind, title) VALUES ('r-2', '${VAULT_ID}', 'markdown', 'Resource 2');
`;

function setup(): { db: Database.Database; store: VectorStore } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(STUB_SCHEMA);
  db.exec(m0009Rag.sql);
  const store = createNodeVectorStore(db);
  return { db, store };
}

function makeChunk(overrides: Partial<ChunkInput> = {}): ChunkInput {
  return {
    id: overrides.id ?? "c-001",
    vaultId: overrides.vaultId ?? VAULT_ID,
    sourceKind: overrides.sourceKind ?? "resource",
    sourceId: overrides.sourceId ?? RESOURCE_ID,
    sourceTitle: overrides.sourceTitle ?? "Test Source",
    chunkIndex: overrides.chunkIndex ?? 0,
    headingPath: overrides.headingPath ?? "Section 1",
    textContent: overrides.textContent ?? "This is test content for chunking.",
    contentHash: overrides.contentHash ?? "a".repeat(64),
    charOffsetStart: overrides.charOffsetStart ?? 0,
    charOffsetEnd: overrides.charOffsetEnd ?? 40,
    embedding: overrides.embedding ?? new Float32Array(Array(1536).fill(0.1)),
  };
}

describe("VectorStore contract (Node adapter)", () => {
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

  it("init is idempotent (safe to call multiple times)", async () => {
    await store.init();
    await store.init();
  });

  it("inserts a single chunk and returns count 1", async () => {
    const count = await store.insertChunks([makeChunk()]);
    expect(count).toBe(1);
    const row = db.prepare("SELECT * FROM chunks WHERE id = ?").get("c-001");
    expect(row).toBeTruthy();
  });

  it("inserts multiple chunks", async () => {
    const count = await store.insertChunks([
      makeChunk({ id: "c-001", chunkIndex: 0 }),
      makeChunk({ id: "c-002", chunkIndex: 1 }),
    ]);
    expect(count).toBe(2);
  });

  it("creates resource_map rows for chunks with sourceKind=resource", async () => {
    await store.insertChunks([makeChunk({ sourceKind: "resource" })]);
    const rows = db.prepare("SELECT * FROM resource_map WHERE chunk_id = ?").all("c-001");
    expect(rows).toHaveLength(1);
  });

  it("does NOT create resource_map rows for sourceKind=note", async () => {
    await store.insertChunks([
      makeChunk({ id: "c-note", sourceKind: "note", sourceId: NOTE_ID }),
    ]);
    const rows = db.prepare("SELECT * FROM resource_map WHERE chunk_id = ?").all("c-note");
    expect(rows).toHaveLength(0);
  });

  it("deletes chunks for a given source and returns deleted count", async () => {
    await store.insertChunks([
      makeChunk({ id: "c-001", chunkIndex: 0 }),
      makeChunk({ id: "c-002", chunkIndex: 1 }),
    ]);
    const deleted = await store.deleteBySource("resource", RESOURCE_ID);
    expect(deleted).toBe(2);
    const rows = db.prepare("SELECT * FROM chunks WHERE source_id = ?").all(RESOURCE_ID);
    expect(rows).toHaveLength(0);
  });

  it("cascade-deletes resource_map rows", async () => {
    await store.insertChunks([makeChunk()]);
    await store.deleteBySource("resource", RESOURCE_ID);
    const mapRows = db.prepare("SELECT * FROM resource_map").all();
    expect(mapRows).toHaveLength(0);
  });

  it("does not delete chunks from other sources", async () => {
    await store.insertChunks([
      makeChunk({ id: "c-001", sourceId: "r-1" }),
      makeChunk({ id: "c-002", sourceId: "r-2" }),
    ]);
    await store.deleteBySource("resource", "r-1");
    const rows = db.prepare("SELECT * FROM chunks WHERE source_id = ?").all("r-2");
    expect(rows).toHaveLength(1);
  });

  it("returns top-k results ordered by ascending distance", async () => {
    const embedding = new Float32Array(1536);
    embedding[0] = 1.0;
    await store.insertChunks([makeChunk({ id: "c-a", textContent: "alpha", embedding })]);
    const query = new Float32Array(1536);
    query[0] = 1.0;
    const results = await store.search(query, 5, VAULT_ID);
    expect(results.length).toBe(1);
    expect(results[0].chunk.id).toBe("c-a");
    expect(results[0].chunk.source_kind).toBe("resource");
  });

  it("filters by sourceKind", async () => {
    const emb = new Float32Array(1536).fill(0.05);
    await store.insertChunks([
      makeChunk({ id: "c-res", sourceKind: "resource", textContent: "res", embedding: emb }),
      makeChunk({ id: "c-note", sourceKind: "note", sourceId: NOTE_ID, textContent: "note", embedding: emb }),
    ]);
    const query = new Float32Array(1536).fill(0.05);
    const resOnly = await store.search(query, 10, VAULT_ID, { sourceKind: "resource" });
    expect(resOnly.map((r) => r.chunk.id)).toContain("c-res");
    expect(resOnly.map((r) => r.chunk.id)).not.toContain("c-note");
  });

  it("returns stats grouped by source", async () => {
    await store.insertChunks([
      makeChunk({ id: "c-001", chunkIndex: 0 }),
      makeChunk({ id: "c-002", chunkIndex: 1 }),
    ]);
    const stats = await store.getSourceStats(VAULT_ID);
    expect(stats).toHaveLength(1);
    expect(stats[0].sourceId).toBe(RESOURCE_ID);
    expect(stats[0].chunkCount).toBe(2);
  });

  it("returns empty stats for a vault with no chunks", async () => {
    const stats = await store.getSourceStats(NONEXISTENT_VAULT);
    expect(stats).toHaveLength(0);
  });

  it("returns total chunk count for a vault", async () => {
    await store.insertChunks([makeChunk()]);
    const count = await store.getChunkCount(VAULT_ID);
    expect(count).toBe(1);
  });

  it("returns 0 for a vault with no chunks", async () => {
    const count = await store.getChunkCount(NONEXISTENT_VAULT);
    expect(count).toBe(0);
  });
});
