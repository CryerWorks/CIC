# Data Model: RAG Ingestion Pipeline (017)

**Feature**: 017-rag-ingestion | **Date**: 2026-06-10

## Entity-Relationship Diagram

```
┌─────────────┐       ┌──────────────┐       ┌────────────────┐
│   vaults    │       │   resources  │       │   milestones   │
│  (existing) │       │  (existing)  │       │  (existing)    │
└──────┬──────┘       └──────┬───────┘       └───────┬────────┘
       │                     │                       │
       │ 1:N                 │ 1:N                   │ 0..1:N
       ▼                     ▼                       ▼
┌──────────────┐    ┌───────────────┐    ┌──────────────────┐
│   chunks     │◄───┤ resource_map  │    │  indexed_notes   │
│              │    └───────────────┘    │                  │
│  + content   │                         │  tracks which    │
│    _hash     │                         │  vault .md files │
│  + source    │                         │  are in the      │
│    _kind     │                         │  corpus          │
│  + source    │                         └──────────────────┘
│    _id       │
└──────┬───────┘
       │ 1:1
       ▼
┌──────────────┐
│  chunks_vec  │  (sqlite-vec virtual table)
│              │
│  + chunk_id  │
│  + embedding │
└──────────────┘
```

## Entities

### Chunks

Stores metadata for each chunk of text extracted from a Resource file or vault note. The embedding vector lives in `chunks_vec`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK, UUID | Chunk unique ID |
| `vault_id` | TEXT | NOT NULL, FK → vaults(id) ON DELETE CASCADE | Vault scope |
| `source_kind` | TEXT | NOT NULL, CHECK ('resource', 'note') | Discriminates Resource vs Note |
| `source_id` | TEXT | NOT NULL | resources.id (for resources) or vault-relative path (for notes) |
| `source_title` | TEXT | NOT NULL | Display name: Resource title or note file title |
| `chunk_index` | INTEGER | NOT NULL | Sequential position within source |
| `heading_path` | TEXT | NULLABLE | Structural locator: "Chapter 1 > Section 1.2" |
| `text_content` | TEXT | NOT NULL | Chunk text (max ~2000 chars) |
| `content_hash` | TEXT | NOT NULL | SHA-256 hex of text_content (64 chars) |
| `char_offset_start` | INTEGER | NOT NULL | Start offset in source file |
| `char_offset_end` | INTEGER | NOT NULL | End offset in source file |
| `created_at` | TEXT | NOT NULL, DEFAULT datetime('now') | Insertion timestamp |

**Uniqueness**: `(source_kind, source_id, chunk_index)` — one chunk per source position.

**Zod schema** (on read):
```ts
const ChunkRow = z.object({
  id: z.string(),
  vault_id: z.string(),
  source_kind: z.enum(['resource', 'note']),
  source_id: z.string(),
  source_title: z.string(),
  chunk_index: z.number().int().min(0),
  heading_path: z.string().nullable(),
  text_content: z.string(),
  content_hash: z.string().length(64),
  char_offset_start: z.number().int().min(0),
  char_offset_end: z.number().int().min(0),
  created_at: z.string(),
});
```

### chunks_vec (sqlite-vec virtual table)

Stores float32 embeddings. Managed by sqlite-vec, not a traditional table.

| Column | Type | Description |
|--------|------|-------------|
| `chunk_id` | TEXT | FK → chunks(id) — implicit join target |
| `embedding` | FLOAT[] | Variable-dimension embedding vector (typically 768 or 1536) |

**Query pattern**:
```sql
SELECT c.*, v.distance
FROM chunks_vec v
JOIN chunks c ON c.id = v.chunk_id
WHERE v.embedding MATCH vec_f32(?)
  AND c.vault_id = ?
ORDER BY v.distance
LIMIT ?
```

**No zod schema**: sqlite-vec manages this internally.

### resource_map

Links chunks to Resources (and optionally to Milestones). Enables retrieval filtering by Course and citation ability.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK, UUID | Row ID |
| `chunk_id` | TEXT | NOT NULL, FK → chunks(id) ON DELETE CASCADE | Chunk reference |
| `resource_id` | TEXT | NOT NULL, FK → resources(id) ON DELETE CASCADE | Resource reference |
| `milestone_id` | TEXT | NULLABLE, FK → milestones(id) ON DELETE SET NULL | Optional milestone link |
| `locator` | TEXT | NOT NULL | Heading/TOC path for citation |

**Zod schema**:
```ts
const ResourceMapRow = z.object({
  id: z.string(),
  chunk_id: z.string(),
  resource_id: z.string(),
  milestone_id: z.string().nullable(),
  locator: z.string(),
});
```

### indexed_notes

Tracks which vault notes have been explicitly indexed. Enables:
- "Index this note" / "Remove from index" toggle state
- Vault rescan cleanup (remove chunks for deleted notes)
- Listing indexed notes on the management UI

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK, UUID | Row ID |
| `vault_id` | TEXT | NOT NULL, FK → vaults(id) ON DELETE CASCADE | Vault scope |
| `note_path` | TEXT | NOT NULL | Vault-relative file path (e.g., "Math/chain-rule.md") |
| `title` | TEXT | NOT NULL | Note title (from frontmatter or first heading) |
| `chunk_count` | INTEGER | NOT NULL, DEFAULT 0 | Number of chunks currently in corpus |
| `last_indexed_at` | TEXT | NOT NULL | Last successful indexing timestamp |

**Uniqueness**: `(vault_id, note_path)` — one entry per note per vault.

**Zod schema**:
```ts
const IndexedNoteRow = z.object({
  id: z.string(),
  vault_id: z.string(),
  note_path: z.string(),
  title: z.string(),
  chunk_count: z.number().int().min(0),
  last_indexed_at: z.string(),
});
```

## Existing Tables (Extended/Impacted)

### resources (existing — 010/011)

| Column | Change | Description |
|--------|--------|-------------|
| `ingested_at` | Already exists | Updated on ingestion/re-ingestion (FR-016) |
| `chunk_count` | NEW (derived) | Read-model: `COUNT(*) FROM chunks JOIN resource_map WHERE resource_id = ?` |

### No other existing tables modified — additive only.

## State Transitions

### Chunk Lifecycle

```
[Source file parsed] → [chunks created] → [embedded] → [stored in chunks + chunks_vec + resource_map]
                                                                      │
                                                          ┌───────────┴───────────┐
                                                          ▼                       ▼
                                                    [Re-ingested]           [Resource deleted]
                                                          │                       │
                                                    ┌─────┴─────┐          ┌──────┴──────┐
                                               [Unchanged]  [Changed]   [Cascade delete]
                                               [Keep+skip]  [Re-embed]  [chunks + map + vec]
                                                    │           │
                                                    └─────┬─────┘
                                                          ▼
                                                     [Add new chunks]
                                                     [Delete removed chunks]
```

### Indexed Note Lifecycle

```
[Note exists in vault] → [User clicks "Index this note"]
                              │
                              ▼
                    [Note read via VaultReader]
                    [Chunked by headings]
                    [Embedded via router]
                    [Stored with source_kind='note']
                    [indexed_notes row created]
                    [last_indexed_at = now()]
                              │
                    ┌─────────┼─────────┐
                    ▼                   ▼
            [User re-indexes]    [Note deleted from vault]
                    │                   │
                    ▼                   ▼
            [Incremental          [Vault rescan detects]
             re-ingestion]        [Cascade delete chunks]
            [Update last_         [Delete indexed_notes row]
             indexed_at]
```

## Data Volume Assumptions

- Personal scale: hundreds to low thousands of chunks per vault
- Typical chunk size: 500–2000 characters
- Typical embedding dimension: 768 (Ollama nomic-embed-text) or 1536 (OpenAI text-embedding-3-small)
- A 50KB Markdown file → ~10–25 chunks
- A 500-page EPUB → ~200–500 chunks
- sqlite-vec stores vectors as blobs: 4 bytes × 768 dim × 1000 chunks = ~3MB
- Total DB size per vault (chunks + vectors): well under 100MB for typical use
