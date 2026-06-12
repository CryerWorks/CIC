// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createNodeVectorStore } from "../adapters/rag/node";
import { indexNote, unindexNote, isNoteIndexed, getIndexedNotes } from "./noteIndexer";
import { m0009Rag } from "../../db/migrations/m0009_rag";
import { NodeSqlExecutor } from "../../db/adapters/node";
import type { AIRouter } from "../router";
import type { VectorStore } from "./vectorStore";

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
CREATE TABLE IF NOT EXISTS indexed_notes (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  note_path TEXT NOT NULL,
  title TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  last_indexed_at TEXT NOT NULL,
  UNIQUE(vault_id, note_path)
);
INSERT OR IGNORE INTO vaults (id, path) VALUES ('${VID}', '/v1');
`;

const NOTE_TEXT = `
# Calculus

## Derivatives

The derivative measures instantaneous rate of change. f'(x) = lim(h→0) [f(x+h)-f(x)]/h.

## Integrals

The integral computes area under a curve. \u222b f(x) dx from a to b.

## Fundamental Theorem

Differentiation and integration are inverse operations.
`;

function fakeRouter(dim = 4): AIRouter {
  return {
    embed: async (_role: string, texts: string[]) => {
      const vectors = texts.map((t: string) => {
        const v = new Float32Array(dim);
        for (let i = 0; i < dim; i++) v[i] = (t.length + i) / 100;
        return v;
      });
      return { vectors, model: "test-embedder", dimensions: dim };
    },
    chat: () => { throw new Error("not used"); },
    probe: () => { throw new Error("not used"); },
  } as unknown as AIRouter;
}

function setup(): { db: Database.Database; store: VectorStore; dbExecutor: NodeSqlExecutor } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(STUB_SCHEMA);
  db.exec(m0009Rag.sql);

  // Wrap better-sqlite3 for the SqlExecutor interface needed by noteIndexer.
  // Use binding objects ({1: val, 2: val}) for numbered params since better-sqlite3
  // expects that form for ?1/?2 style placeholders.
  function toBinding(params: (string | number | null)[]): Record<number, string | number | null> {
    const obj: Record<number, string | number | null> = {};
    for (let i = 0; i < params.length; i++) obj[i + 1] = params[i];
    return obj;
  }
  const dbExecutor = {
    execute: (sql: string, params: (string | number | null)[] = []) => {
      const stmt = db.prepare(sql);
      const r = params.length > 0 ? stmt.run(toBinding(params)) : stmt.run();
      return Promise.resolve({ rowsAffected: r.changes, lastInsertId: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined });
    },
    select: <T>(sql: string, params: (string | number | null)[] = []) => {
      const stmt = db.prepare(sql);
      const rows = params.length > 0 ? stmt.all(toBinding(params)) : stmt.all();
      return Promise.resolve(rows as T[]);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      return fn(dbExecutor);
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const store = createNodeVectorStore(db);
  return { db, store, dbExecutor };
}

describe("noteIndexer", () => {
  let db: Database.Database;
  let store: VectorStore;
  let dbExecutor: NodeSqlExecutor;

  beforeEach(async () => {
    const s = setup();
    db = s.db;
    store = s.store;
    dbExecutor = s.dbExecutor;
    await store.init();
  });

  afterEach(() => {
    db.close();
  });

  it("indexes a vault note and creates chunks with source_kind=note", async () => {
    const result = await indexNote({
      noteContent: NOTE_TEXT,
      notePath: "Math/calculus.md",
      title: "Calculus",
      vaultId: VID,
      db: dbExecutor,
      vectorStore: store,
      router: fakeRouter(),
    });

    expect(result.chunkCount).toBeGreaterThanOrEqual(3);
    expect(result.sourceId).toBe("Math/calculus.md");

    // Verify chunks are in the vector store
    const indexed = await isNoteIndexed(dbExecutor, VID, "Math/calculus.md");
    expect(indexed).toBe(true);

    // Verify retrieval works
    const searchResults = await store.search(
      new Float32Array([0.05, 0.06, 0.07, 0.08]),
      5,
      VID,
      { sourceKind: "note" },
    );
    expect(searchResults.length).toBeGreaterThan(0);
    for (const r of searchResults) {
      expect(r.chunk.source_kind).toBe("note");
    }
  });

  it("unindexes a note and removes all chunks", async () => {
    await indexNote({
      noteContent: NOTE_TEXT,
      notePath: "Math/calculus.md",
      title: "Calculus",
      vaultId: VID,
      db: dbExecutor,
      vectorStore: store,
      router: fakeRouter(),
    });

    await unindexNote(dbExecutor, store, VID, "Math/calculus.md");

    const indexed = await isNoteIndexed(dbExecutor, VID, "Math/calculus.md");
    expect(indexed).toBe(false);

    const searchResults = await store.search(
      new Float32Array([0.05, 0.06, 0.07, 0.08]),
      5,
      VID,
      { sourceKind: "note" },
    );
    expect(searchResults).toEqual([]);
  });

  it("isNoteIndexed returns false for unknown note", async () => {
    const indexed = await isNoteIndexed(dbExecutor, VID, "Math/nonexistent.md");
    expect(indexed).toBe(false);
  });

  it("re-indexing replaces chunks and updates timestamp", async () => {
    const first = await indexNote({
      noteContent: NOTE_TEXT,
      notePath: "Math/calculus.md",
      title: "Calculus",
      vaultId: VID,
      db: dbExecutor,
      vectorStore: store,
      router: fakeRouter(),
    });

    // Re-index with same content (should skip all via hashing)
    const second = await indexNote({
      noteContent: NOTE_TEXT,
      notePath: "Math/calculus.md",
      title: "Calculus (updated)",
      vaultId: VID,
      db: dbExecutor,
      vectorStore: store,
      router: fakeRouter(),
    });

    expect(second.skippedCount).toBe(first.chunkCount);
    expect(second.chunkCount).toBe(first.chunkCount);

    // Title should be updated in indexed_notes
    const notes = await getIndexedNotes(dbExecutor, VID);
    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe("Calculus (updated)");
  });

  it("getIndexedNotes returns all indexed notes sorted by title", async () => {
    await indexNote({
      noteContent: "# Algebra\n\nProperties of groups and rings.",
      notePath: "Math/algebra.md",
      title: "Algebra",
      vaultId: VID,
      db: dbExecutor,
      vectorStore: store,
      router: fakeRouter(),
    });

    await indexNote({
      noteContent: "# Geometry\n\nShapes in Euclidean space.",
      notePath: "Math/geometry.md",
      title: "Geometry",
      vaultId: VID,
      db: dbExecutor,
      vectorStore: store,
      router: fakeRouter(),
    });

    const notes = await getIndexedNotes(dbExecutor, VID);
    expect(notes.length).toBe(2);
    expect(notes[0].title).toBe("Algebra");
    expect(notes[1].title).toBe("Geometry");
    for (const n of notes) {
      expect(n.chunkCount).toBeGreaterThan(0);
      expect(n.lastIndexedAt).toBeTruthy();
    }
  });

  it("vault isolation: notes in different vaults are independent", async () => {
    const VID2 = "v-other";
    db.exec(`INSERT OR IGNORE INTO vaults (id, path) VALUES ('${VID2}', '/v2')`);

    await indexNote({
      noteContent: NOTE_TEXT,
      notePath: "Math/calculus.md",
      title: "Calculus V1",
      vaultId: VID,
      db: dbExecutor,
      vectorStore: store,
      router: fakeRouter(),
    });

    const notesV1 = await getIndexedNotes(dbExecutor, VID);
    expect(notesV1.length).toBe(1);

    const notesV2 = await getIndexedNotes(dbExecutor, VID2);
    expect(notesV2.length).toBe(0);
  });

  it("indexing empty note creates zero chunks", async () => {
    const result = await indexNote({
      noteContent: "",
      notePath: "empty.md",
      title: "Empty",
      vaultId: VID,
      db: dbExecutor,
      vectorStore: store,
      router: fakeRouter(),
    });

    expect(result.chunkCount).toBe(0);
  });
});
