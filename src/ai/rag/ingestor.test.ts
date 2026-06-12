// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createNodeVectorStore } from "../adapters/rag/node";
import { ingestMarkdown } from "./ingestor";
import { chunkMarkdown } from "./chunker/markdown";
import { hashContent } from "./hashing";
import type { AIRouter } from "../router";
import type { EmbedResult } from "../provider";
import type { SqlExecutor, SqlValue, ExecuteResult } from "../../db/executor";
import { ProviderError } from "../errors";

/**
 * Thin SqlExecutor wrapper around better-sqlite3 for test use.
 */
function betterSqlExecutor(db: Database.Database): SqlExecutor {
  return {
    async execute(sql: string, params?: SqlValue[]): Promise<ExecuteResult> {
      const stmt = db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return { rowsAffected: result.changes, lastInsertId: Number(result.lastInsertRowid) };
    },
    async select<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]> {
      const stmt = db.prepare(sql);
      const rows = params ? stmt.all(...params) : stmt.all();
      return (rows as T[]);
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const wrapper = db.transaction(() => {
        // better-sqlite3 transactions are sync, but the SqlExecutor API is async
        // Use a sync helper pattern
        return fn(betterSqlExecutor(db));
      });
      return wrapper();
    },
  };
}

/** Fake router returning deterministic 4-dim vectors derived from text length. */
function fakeRouter(): AIRouter {
  return {
    async embed(
      _role: string,
      texts: string[],
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _opts: Record<string, unknown>,
    ): Promise<EmbedResult> {
      const vectors = texts.map((t) => {
        const seed = t.length;
        return [seed / 100, (seed % 37) / 37, (seed % 53) / 53, (seed % 71) / 71];
      });
      return { vectors, model: "test-embed", dimensions: 4 };
    },
    chat: () =>
      (async function* () {
        yield {} as never;
      })(),
    probe: async () => ({}) as never,
  } as unknown as AIRouter;
}

const M0009_SQL = `
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('resource', 'note')),
  source_id TEXT NOT NULL,
  source_title TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading_path TEXT,
  text_content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  char_offset_start INTEGER NOT NULL,
  char_offset_end INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_kind, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_vault ON chunks(vault_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_kind, source_id);

CREATE TABLE IF NOT EXISTS resource_map (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  locator TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resource_map_resource ON resource_map(resource_id);

CREATE TABLE IF NOT EXISTS indexed_notes (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  note_path TEXT NOT NULL,
  title TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  last_indexed_at TEXT NOT NULL,
  UNIQUE(vault_id, note_path)
);

CREATE INDEX IF NOT EXISTS idx_indexed_notes_vault ON indexed_notes(vault_id);
`;

const VAULTS_SQL = `
CREATE TABLE IF NOT EXISTS vaults (id TEXT PRIMARY KEY, path TEXT NOT NULL, created_at TEXT NOT NULL)
`;

const RESOURCES_SQL = `
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  vault_id TEXT REFERENCES vaults(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT,
  url TEXT,
  metadata TEXT,
  domain_id TEXT,
  ingested_at TEXT
)
`;

const MILESTONES_SQL = `
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
)
`;

describe("ingestMarkdown", () => {
  let sqlite: Database.Database;
  let store: ReturnType<typeof createNodeVectorStore>;
  let router: AIRouter;
  let db: SqlExecutor;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(VAULTS_SQL);
    sqlite.exec(RESOURCES_SQL);
    sqlite.exec(MILESTONES_SQL);
    sqlite.exec(M0009_SQL);

    store = createNodeVectorStore(sqlite);
    router = fakeRouter();
    db = betterSqlExecutor(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("ingests a simple markdown file end-to-end", async () => {
    // Need vault row for FK
    await db.execute(
      "INSERT INTO vaults (id, path, created_at) VALUES (?, ?, ?)",
      ["v1", "/test", new Date().toISOString()],
    );
    await db.execute(
      "INSERT INTO resources (id, vault_id, title, kind) VALUES (?, ?, ?, ?)",
      ["res-1", "v1", "Test Resource", "markdown"],
    );

    await store.init();

    const markdown = `# Introduction
This is the first chapter.

## Section 1
Content of section one.

## Section 2
Content of section two.`;

    const result = await ingestMarkdown(
      db,
      store,
      router,
      {
        resourceId: "res-1",
        vaultId: "v1",
        title: "Test Resource",
        rawText: markdown,
      },
    );

    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.apiCalls).toBeGreaterThan(0);
    expect(result.skippedCount).toBe(0);
    expect(result.sourceTitle).toBe("Test Resource");

    const chunkCount = await store.getChunkCount("v1");
    expect(chunkCount).toBe(result.chunkCount);
  });

  it("sets ingested_at on the resource", async () => {
    await db.execute("INSERT INTO vaults (id, path, created_at) VALUES (?, ?, ?)", [
      "v1", "/test", new Date().toISOString(),
    ]);
    await db.execute(
      "INSERT INTO resources (id, vault_id, title, kind) VALUES (?, ?, ?, ?)",
      ["res-at", "v1", "Test", "markdown"],
    );
    await store.init();

    const result = await ingestMarkdown(db, store, router, {
      resourceId: "res-at",
      vaultId: "v1",
      title: "Test",
      rawText: "# Hi\nhello world",
    });

    expect(result.ingestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Verify ingested_at was updated
    const rows = (await db.select(
      "SELECT ingested_at FROM resources WHERE id = ?",
      ["res-at"],
    )) as { ingested_at: string | null }[];
    expect(rows[0]?.ingested_at).toBeTruthy();
  });

  it("handles incremental re-ingestion with unchanged chunks", async () => {
    await db.execute("INSERT INTO vaults (id, path, created_at) VALUES (?, ?, ?)", [
      "v1", "/test", new Date().toISOString(),
    ]);
    await db.execute(
      "INSERT INTO resources (id, vault_id, title, kind) VALUES (?, ?, ?, ?)",
      ["res-incr", "v1", "Incremental", "markdown"],
    );
    await store.init();

    const markdown = `# One\nfirst\n\n# Two\nsecond`;

    // First ingestion
    await ingestMarkdown(db, store, router, {
      resourceId: "res-incr",
      vaultId: "v1",
      title: "Incremental",
      rawText: markdown,
    });

    // Build existing hashes
    const doc2 = chunkMarkdown(markdown, "resource", "res-incr", "Incremental", "v1");
    const hashes = await Promise.all(
      doc2.chunks.map((c) => hashContent(c.textContent)),
    );
    const existingHashes = new Map<string, string>();
    for (const h of hashes) existingHashes.set(h, "any-id");

    // Re-ingest with same content
    const result = await ingestMarkdown(db, store, router, {
      resourceId: "res-incr",
      vaultId: "v1",
      title: "Incremental",
      rawText: markdown,
      existingHashes,
    });

    expect(result.skippedCount).toBe(doc2.chunks.length);
    expect(result.apiCalls).toBe(0);
  });

  it("handles incremental re-ingestion with modified chunks", async () => {
    await db.execute("INSERT INTO vaults (id, path, created_at) VALUES (?, ?, ?)", [
      "v1", "/test", new Date().toISOString(),
    ]);
    await db.execute(
      "INSERT INTO resources (id, vault_id, title, kind) VALUES (?, ?, ?, ?)",
      ["res-mod", "v1", "Modified", "markdown"],
    );
    await store.init();

    const original = `# Original\nunchanged`;

    await ingestMarkdown(db, store, router, {
      resourceId: "res-mod",
      vaultId: "v1",
      title: "Modified",
      rawText: original,
    });

    const docMod = chunkMarkdown(original, "resource", "res-mod", "Modified", "v1");
    const hashes = await Promise.all(
      docMod.chunks.map((c) => hashContent(c.textContent)),
    );
    const existingHashes = new Map<string, string>();
    for (const h of hashes) existingHashes.set(h, "any-id");

    const modified = `# Original\nchanged content`;
    const result = await ingestMarkdown(db, store, router, {
      resourceId: "res-mod",
      vaultId: "v1",
      title: "Modified",
      rawText: modified,
      existingHashes,
    });

    expect(result.apiCalls).toBeGreaterThan(0);
    expect(result.chunkCount).toBeGreaterThan(0);
  });

  it("replaces old chunks on re-ingestion", async () => {
    await db.execute("INSERT INTO vaults (id, path, created_at) VALUES (?, ?, ?)", [
      "v1", "/test", new Date().toISOString(),
    ]);
    await db.execute(
      "INSERT INTO resources (id, vault_id, title, kind) VALUES (?, ?, ?, ?)",
      ["res-replace", "v1", "Replace", "markdown"],
    );
    await store.init();

    await ingestMarkdown(db, store, router, {
      resourceId: "res-replace",
      vaultId: "v1",
      title: "Replace",
      rawText: "# A\ncontent A",
    });

    await ingestMarkdown(db, store, router, {
      resourceId: "res-replace",
      vaultId: "v1",
      title: "Replace",
      rawText: "# B\ncontent B",
    });

    const stats = await store.getSourceStats("v1");
    const resourceStat = stats.find((s) => s.sourceId === "res-replace");
    expect(resourceStat?.chunkCount).toBe(1);
  });

  it("preserves old chunks when embedding fails (lockdown gate — T044)", async () => {
    await db.execute(
      "INSERT INTO vaults (id, path, created_at) VALUES (?, ?, ?)",
      ["v1", "/test", new Date().toISOString()],
    );
    await db.execute(
      "INSERT INTO resources (id, vault_id, title, kind) VALUES (?, ?, ?, ?)",
      ["res-lock", "v1", "Lockdown Test", "markdown"],
    );
    await store.init();

    // First ingestion — succeeds
    const markdown = "# Original\noriginal content here";
    await ingestMarkdown(db, store, router, {
      resourceId: "res-lock",
      vaultId: "v1",
      title: "Lockdown Test",
      rawText: markdown,
    });

    const originalChunkCount = await store.getChunkCount("v1");
    expect(originalChunkCount).toBeGreaterThan(0);

    // Second ingestion with a router that throws lockdown error
    const lockingRouter = {
      embed: async (
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _role: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _texts: string[],
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _opts: Record<string, unknown>,
      ): Promise<EmbedResult> => {
        throw new ProviderError(
          "unsupported",
          "test-remote",
          "local-only lockdown blocks remote providers for vault content",
          false,
        );
      },
      chat: () =>
        (async function* () {
          yield {} as never;
        })(),
      probe: async () => ({}) as never,
    } as unknown as AIRouter;

    await expect(
      ingestMarkdown(db, store, lockingRouter, {
        resourceId: "res-lock",
        vaultId: "v1",
        title: "Lockdown Test",
        rawText: "# Modified\nchanged content",
      }),
    ).rejects.toThrow(ProviderError);

    // Old chunks should still exist (not deleted before failed embed)
    const chunkCountAfter = await store.getChunkCount("v1");
    expect(chunkCountAfter).toBe(originalChunkCount);

    // ingested_at should NOT have been updated
    const rows = (await db.select(
      "SELECT ingested_at FROM resources WHERE id = ?",
      ["res-lock"],
    )) as { ingested_at: string | null }[];
    const ingestedAt = rows[0]?.ingested_at;
    expect(ingestedAt).toBeTruthy(); // still set from first ingestion
  });
});
