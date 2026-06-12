# Feature Specification: RAG Ingestion Pipeline (F10.2 Core)

**Feature Branch**: `017-rag-ingestion`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "F10.2 RAG ingestion — chunk, embed, store vector chunks from ingested Resource files for AI-grounded retrieval. sqlite-vec for vector store, Markdown + EPUB first, retrieval API included."

## Clarifications

### Session 2026-06-10

- Q: Should retrieval be API-only or include a user-facing search UI? → A: Full dedicated "Search my corpus" page with filters and results browsing. Also, retrieval results must tag each chunk with its source type (corpus literature / Resource vs personal note) so the UI never conflates the two.
- Q: How do vault notes get into the vector store? → A: Manual per-note indexing — the learner explicitly marks individual notes (or folders) for inclusion via an "Index this note" action. No auto-indexing.
- Q: Full re-embedding vs incremental on re-ingestion? → A: Content-hash incremental — store a hash per chunk, skip re-embedding unchanged chunks on re-ingestion, only embed new or modified chunks.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ingest a Markdown Resource (Priority: P1)

A learner has a Markdown file registered as a Resource (e.g., course notes, a textbook chapter converted to `.md`, or an Obsidian note already in the vault). They want the AI tutor to be able to ground its answers in this content. They click "Ingest" on the Resource. The system parses the file, chunks it by heading structure (preserving `[[wikilinks]]`), embeds every chunk via the configured AI provider, stores the chunks and their vector embeddings, and marks the Resource as ingested. The learner sees a confirmation with the chunk count.

**Why this priority**: Markdown is the simplest format (headings = structure, no OCR, no layout guessing) and it unlocks the entire end-to-end pipeline — chunk, embed, store, retrieve. Every remaining format (EPUB, later PDF) reuses the same embedding + storage + retrieval layers. Markdown-first gives working RAG in the shortest time.

**Independent Test**: Register a Markdown Resource with a file attachment, trigger ingestion, verify chunk count > 0, verify `ingested_at` is set, verify retrieval returns chunks from this Resource that match the query.

**Acceptance Scenarios**:

1. **Given** a Markdown Resource with an attached file containing 3 heading sections, **When** the learner triggers ingestion, **Then** the file is parsed into at least 3 chunks (one per heading), each chunk is embedded and stored, and the Resource shows `ingested: [timestamp]` with chunk count.
2. **Given** an ingested Markdown Resource, **When** the learner re-ingests it (file content changed), **Then** old chunks are replaced, new chunks are embedded, and the chunk count reflects the new content.
3. **Given** a Markdown Resource with no file attachment, **When** the learner tries to ingest, **Then** the system surfaces a clear message that a file is required (no silent failure).
4. **Given** a Markdown file containing `[[wikilinks]]` and frontmatter, **When** the file is chunked, **Then** wikilinks are preserved in chunk text, and frontmatter is excluded from chunks but its title is captured as chunk metadata.

---

### User Story 2 - Search the knowledge corpus (Priority: P2)

A learner (or the Feynman tutor / quiz system) needs to find the most relevant source material for a question. They navigate to a dedicated "Search Corpus" page, enter a natural-language query (e.g., "explain the chain rule"), and see the top-k most similar chunks across all ingested Resources and indexed vault notes in the active vault, ranked by relevance. Each result shows the chunk text, the source name, a locator (e.g., "Chapter 3: Derivatives"), and a **source kind tag** — `Resource` (imported literature) or `Note` (personal vault note) — so the learner immediately knows whether the grounding comes from published material or their own writing. Filters allow narrowing by Course, Resource, or source kind.

**Why this priority**: Retrieval is the entire point of the vector store — without it, chunk+embed+store is a write-only pipeline. The dedicated search page is the primary UI surface the learner interacts with, and the source-kind tag is essential for trust (never conflate "the textbook says" with "I wrote"). This is the API that F4 (Feynman tutor) and F5 (quizzes) also consume programmatically, and it is independently testable.

**Independent Test**: Ingest two Markdown Resources with distinct topics, query for content from one, verify top results are from the correct Resource with descending similarity.

**Acceptance Scenarios**:

1. **Given** two ingested Resources (one about calculus, one about history), **When** the learner searches "derivatives and integrals" on the Search Corpus page, **Then** the top results are from the calculus Resource, with the history Resource ranked lower or absent. Each result displays a `Resource` source-kind tag.
2. **Given** ingested Resources and indexed vault notes, **When** the learner searches a topic present in both, **Then** results from Resources show a `Resource` tag and results from vault notes show a `Note` tag, visually distinct (never conflated).
3. **Given** an ingested Resource and a query, **When** retrieval is requested with k=5, **Then** exactly 5 results are returned (or fewer if the corpus is smaller), each with chunk text, source name, locator, source-kind tag, and similarity score.
4. **Given** a query matching no content (e.g., gibberish), **When** the learner searches, **Then** the page shows "No matching results" — no error or empty crash.
5. **Given** ingested Resources in vault A, **When** a search runs in vault B's corpus page, **Then** chunks from vault A's Resources are not returned (vault-scoped).
6. **Given** a learner on the Search Corpus page, **When** they filter by Course, **Then** only chunks from Resources linked to that Course appear. **When** they filter by source kind `Note`, **Then** only vault-note chunks appear.

---

### User Story 3 - Ingest an EPUB Resource (Priority: P3)

A learner has an EPUB ebook registered as a Resource. They click "Ingest". The system parses the EPUB, extracts text from its spine items in order, chunks by structural sections (TOC entries), embeds every chunk, and stores them. The learner sees chunk count and can immediately retrieve content from the book.

**Why this priority**: EPUB is the second-cleanest format — structured spine + TOC, no layout guessing, reliable. It's the most common format for technical ebooks (the primary use case for RAG-grounded learning). Lower priority than Markdown because it requires a parsing library and the file structure is more complex, but it reuses the entire chunk→embed→store→retrieve pipeline from P1/P2.

**Independent Test**: Register an EPUB Resource with an attached `.epub` file, trigger ingestion, verify chunks are created (one per TOC section, split further if sections are large), verify retrieval works.

**Acceptance Scenarios**:

1. **Given** an EPUB with 10 TOC sections, **When** the learner triggers ingestion, **Then** at least 10 chunks are created (one per section, more if sections exceed max chunk size), each tagged with its TOC path as locator.
2. **Given** an EPUB with images but no accessible text in a section, **When** chunking encounters that section, **Then** the section is skipped with a warning count, not an error (graceful degradation).
3. **Given** a DRM-protected EPUB, **When** ingestion is attempted, **Then** the system surfaces a clear "cannot read this file" message (no silent failure, no crash).

---

### User Story 4 - View and manage ingested Resources (Priority: P4)

A learner wants to see which Resources have been ingested, how many chunks each has, and when they were last ingested. They can view chunk metadata, trigger re-ingestion, or delete ingestion data.

**Why this priority**: Management UI is necessary for trust and debugging — the learner needs to know what's in the RAG corpus. Without it, the system is a black box. Lower priority because the pipeline works without it, but it's essential for adoption.

**Independent Test**: Ingest a Resource, navigate to its detail view, verify chunk count and ingestion timestamp are displayed.

**Acceptance Scenarios**:

1. **Given** an ingested Resource, **When** the learner views the Resource detail, **Then** `ingested_at` timestamp and chunk count are visible.
2. **Given** an ingested Resource, **When** the learner deletes the Resource, **Then** all associated chunks and resource_map entries are removed (cascade delete).
3. **Given** an ingested Resource, **When** the learner triggers re-ingestion after modifying the source file, **Then** old chunks are replaced, new `ingested_at` timestamp is set, and chunk count updates.

---

### User Story 5 - Index a personal vault note (Priority: P5)

A learner has written a detailed note in their vault (e.g., a summary of a lecture, a worked proof, or a synthesis of several sources). They want this note to appear in the search corpus alongside ingested Resources, tagged as a `Note` so it's never mistaken for published material. They open the note in the app and click "Index this note". The system chunks the note by heading structure (same Markdown pipeline as P1), embeds the chunks, stores them with `source_kind: note`, and the note immediately appears in search results with the `Note` tag.

**Why this priority**: Personal notes are the learner's most valuable reference material — they represent synthesis and understanding, not just raw source text. But indexing notes is lower priority than Resources because: (a) notes already live in Obsidian where the learner can find them, and (b) the note indexing pipeline is the same Markdown chunker from P1 — just a different source. Ships after the Resource ingestion pipeline is proven.

**Independent Test**: Create a vault note with 3 heading sections, click "Index this note", verify it appears in search results with a `Note` tag distinct from Resources.

**Acceptance Scenarios**:

1. **Given** a vault note with content under multiple headings, **When** the learner clicks "Index this note", **Then** the note is chunked, embedded, and stored with `source_kind: note`. A confirmation shows chunk count.
2. **Given** an indexed vault note, **When** the learner searches for its content on the Search Corpus page, **Then** the note's chunks appear with a `Note` tag, visually distinct from `Resource`-tagged results.
3. **Given** an indexed vault note, **When** the learner re-indexes it after editing, **Then** old chunks are replaced (same atomic replace as P1 re-ingestion).
4. **Given** an indexed vault note, **When** the learner deletes the note file from the vault, **Then** the next vault rescan removes its chunks from the index (no orphaned chunks).
5. **Given** a vault note that has not been indexed, **When** the learner views it, **Then** an "Index this note" action is available but the note does NOT appear in search results (explicit opt-in only).

---

### Edge Cases

- What happens when a Markdown file has deeply nested headings (6+ levels)? Treat level 1–3 as structural boundaries; 4+ are flattened into their parent section's chunk.
- What happens when a section exceeds the max chunk size? Split at paragraph boundaries within the section; each sub-chunk inherits the same heading path with a part suffix ("Part 1 of 3").
- What happens when the embedding provider returns an error mid-batch? Roll back the entire ingestion (no partial ingest). The Resource keeps its previous ingested state.
- What happens when the embedding provider is offline or unconfigured? Surface a clear error ("No embedding provider configured. Set one up in Settings → AI.") — no crash.
- What happens when a Resource file has been deleted from disk but the Resource record remains? Ingestion surface "File not found" — the Resource remains in the registry but cannot be ingested until re-attached.
- What happens during lockdown mode with a remote embedding provider? Ingestion is blocked with a clear message — no content leaves the machine.
- What happens when a learner indexes a note that heavily quotes or paraphrases an ingested Resource? Both are chunked independently with different source-kind tags — retrieval may return both, but the tags ensure they're never conflated.
- What happens if the learner indexes a note that was already indexed (re-index)? The note's old chunks are replaced atomically — old ones deleted, new ones inserted in one transaction, same as Resource re-ingestion.
- What happens when sqlite-vec encounters a corrupt vector? The `SchedulingState`-style zod guard validates stored embeddings on read; a corrupt vector is skipped with a warning log (Constitution III — no crash on malformed data).

## Requirements *(mandatory)*

### Functional Requirements

**File Parsing**

- **FR-001**: System MUST parse Markdown files, extracting heading hierarchy (`#` through `###`) as structural chunk boundaries. Content under a heading is included in that heading's chunk.
- **FR-002**: System MUST parse EPUB files, extracting text from spine items in order and using the TOC (table of contents) as structural boundaries.
- **FR-003**: System MUST preserve `[[wikilinks]]` and `[markdown](links)` in chunk text. Frontmatter MUST be excluded from chunk text, but its `title` field MUST be captured as chunk-level metadata.
- **FR-004**: System MUST strip HTML tags from EPUB content and normalize whitespace (collapse multiple newlines, trim).

**Chunking**

- **FR-005**: System MUST split parsed text into chunks at natural boundaries: headings (Markdown), TOC entries (EPUB), and paragraph breaks. Chunks MUST NOT split mid-sentence or mid-paragraph.
- **FR-006**: System MUST enforce a configurable maximum chunk size (default 2000 characters, ~512 tokens). A section exceeding max size MUST be split at the nearest paragraph boundary, with each sub-chunk carrying the same structural path and a part indicator.
- **FR-007**: System MUST assign each chunk a sequential `chunk_index` within its Resource for deterministic ordering.
- **FR-008**: System MUST include structural locator metadata with each chunk: heading path for Markdown (e.g., "## Derivatives > ### Chain Rule"), TOC path for EPUB (e.g., "Chapter 3: Derivatives").

**Embedding**

- **FR-009**: System MUST embed each chunk via `router.embed('embeddings', [text], {containsVaultContent: true})` using the existing AI router (016).
- **FR-010**: System MUST batch chunks for embedding (configurable batch size, default 20 chunks per call) to reduce API round-trips.
- **FR-011**: System MUST respect the lockdown flag: if lockdown is ON and the effective embedding provider (including any fallback) is remote, ingestion MUST be blocked entirely with a clear user-facing message (Constitution II — no vault content to remote when locked down).
- **FR-012**: System MUST handle embedding failures gracefully: a failed batch rolls back the entire ingestion, preserving the Resource's previous ingested state (atomic — no partial ingest).

**Vector Storage**

- **FR-013**: System MUST store chunk embeddings in `sqlite-vec` virtual tables within the same SQLite database as all other CIC data (no separate vector database).
- **FR-014**: System MUST store chunk metadata (text, position, heading path, resource reference) in a `chunks` table with a row per chunk.
- **FR-015**: System MUST create a `resource_map` row per chunk, linking it to its parent Resource and optionally to a Milestone (nullable — milestone association comes later in F10.3).
- **FR-016**: System MUST set `resources.ingested_at = now()` on first ingestion and update it on re-ingestion.
- **FR-017**: System MUST store a content hash per chunk and re-ingestion MUST be incremental by content hash: chunks whose text content has not changed retain their existing embedding (no wasted API calls); changed chunks are re-embedded; chunks no longer present after re-chunking are deleted. No orphaned data.
- **FR-018**: System MUST cascade-delete chunks and resource_map entries when a Resource is deleted.

**Retrieval**

- **FR-019**: System MUST accept a natural-language query string and optional filters (Resource ID, Milestone ID, Course ID) and return the top-k most similar chunks (default k=10, configurable).
- **FR-020**: System MUST embed the query string via the same router, then perform exact KNN search against stored chunk embeddings (brute-force, matching sqlite-vec's current capability).
- **FR-021**: System MUST return results with: chunk text, source name, locator (heading/TOC path), source kind tag (`resource` or `note`), and similarity score. Results MUST be ordered by descending similarity.
- **FR-022**: System MUST scope retrieval to the active vault — chunks from Resources in other vaults MUST NOT appear in results.

**Search UI**

- **FR-023**: System MUST provide a dedicated "Search Corpus" page accessible from the main navigation. The page MUST include a search input, result list, and filter controls (by Course, Resource, and source kind).
- **FR-024**: Each result on the search page MUST display a visually distinct source-kind tag — `Resource` for imported literature and `Note` for vault notes — so the learner never conflates corpus sources with personal writing.
- **FR-025**: The search page MUST support pagination or infinite scroll for result sets larger than one screen.

**Note Indexing**

- **FR-026**: System MUST allow the learner to index an individual vault note via an explicit "Index this note" action. Notes MUST NOT be auto-indexed.
- **FR-027**: System MUST chunk and embed vault notes using the same Markdown parsing pipeline as Resource files (FR-001, FR-003–008), storing chunks with `source_kind: note`.
- **FR-028**: System MUST use the vault note's file path and title (from frontmatter or first heading) as the source name in chunk metadata and search results.
- **FR-029**: System MUST remove a note's chunks from the index when the note file is deleted from the vault (detected on next vault rescan).

**Architecture**

- **FR-030**: System MUST expose all vector operations through a `VectorStore` interface (seam pattern, mirroring `SqlExecutor`/`VaultFs`/`SecretStore`) so tests can use a Node.js adapter and production can use a Tauri/Rust adapter.
- **FR-031**: Only modules under `src/ai/rag/` MAY import or interact with the vector store. Features consume a `useRAG()` hook that calls the abstraction.
- **FR-032**: Migration `m0009` MUST add `chunks` and `resource_map` tables. The migration MUST be additive only (never destructive).
- **FR-033**: System MUST validate all stored chunks and embeddings with zod schemas on read (Constitution III — no crash on malformed data).

### Key Entities

- **Chunk**: A section of text extracted from an ingested Resource file or indexed vault note. Attributes: text content, content hash (for incremental re-embedding), sequential index within the source, structural locator (heading/TOC path), character offset range in the source file, the embedding vector (stored in sqlite-vec), and a **source kind** tag (`resource` for imported literature, `note` for personal vault notes). Belongs to exactly one source (Resource or vault note).
- **Resource Map**: Links a chunk to its parent Resource and optionally to a Milestone. Attributes: chunk ID, resource ID, optional milestone ID, locator string. One row per chunk. Enables retrieval filtering by Course (via Milestone → Course) and citation ("this answer is grounded in Chapter 3 of Resource X").
- **Vector Store**: The sqlite-vec layer storing float embeddings alongside chunk IDs. Queried via KNN `MATCH` for retrieval.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner can ingest a Markdown Resource (under 50KB, ~5 heading sections) and see a confirmation with chunk count in under 30 seconds (including embedding API round-trips).
- **SC-002**: Retrieval for a query across 500 chunks returns top-10 results in under 500ms (user perceives as instant).
- **SC-003**: Ingestion of 100 chunks from a Markdown file completes with zero data loss — every chunk's text, embedding, and metadata is stored and retrievable.
- **SC-004**: Ingesting a second Resource does not affect retrieval results from the first — Resources are independent and retrievable in isolation.
- **SC-005**: When local-only lockdown mode is enabled, ingestion is blocked for any Resource that would require sending content to a remote provider (100% enforcement, no data leaves the machine).
- **SC-006**: A learner can view an ingested Resource's chunk count and ingestion timestamp within 2 clicks from the Resource registry.
- **SC-007**: Re-ingesting a modified Resource correctly handles all cases: changed chunks are re-embedded, unchanged chunks retain their embeddings, removed chunks are deleted, and new chunks are added — with zero orphaned data and no wasted API calls on unchanged content.
- **SC-008**: An EPUB with 20 TOC sections is ingested successfully, producing at least 20 chunks with correct TOC path locators.
- **SC-009**: On the Search Corpus page, Resource chunks and Note chunks are visually distinct — a learner can tell at a glance whether a result came from imported literature or their own writing.

## Assumptions

- **Markdown-first, EPUB-second**: Markdown parsing ships first (P1/P2) because it requires no new dependencies — plain text splitting for headings. EPUB parsing (P3) requires a parsing library (specific library chosen during planning) and ships second, reusing the entire embedding/storage/retrieval pipeline.
- **PDF is out of scope for v1**: PDF is the messiest format (textbook/paper/slide-deck layouts, OCR for scans). It will be a separate feature (018 or later) that reuses this pipeline's embed + store + retrieve layers with a different parser.
- **sqlite-vec as the vector store**: `sqlite-vec` is the locked vector store choice (per PRD §8 default and separate research analysis 2026-06-10). Integration follows the existing seam pattern: a `VectorStore` interface with separate adapters for test and production environments, matching the existing `SqlExecutor`/`VaultFs`/`SecretStore` architecture.
- **Chunking is heading/TOC-aware, not a semantic splitter**: v1 uses structural chunking (headings, TOC) rather than an AI-powered semantic chunker. This is simpler, deterministic, and produces chunks aligned with how the learner navigates the source. Semantic chunking can be added later.
- **Existing Resource registry is the entry point**: Resources already exist (010/011) with CRUD, file attachments, and `ingested_at`. Ingestion is triggered from the existing Resource detail UI. No new Resource management UI is needed — only the ingestion trigger and status display.
- **Course/Milestone filtering in retrieval is additive**: The `resource_map.milestone_id` column is nullable. Ingestion populates `resource_id` only. Milestone association is added later (F10.3 blueprint materialization). Retrieval can filter by Course when milestone links exist, but defaults to vault-wide when they don't.
- **No automatic re-ingestion on file change**: The learner explicitly triggers ingestion and re-ingestion. The file-watcher does not auto-reingest (desirable difficulty — the learner decides when content is ready).
- **Binary quantization is deferred**: `sqlite-vec` supports binary quantization for 32x compression at ~95% accuracy. This is available as a fallback if scale becomes an issue but is not enabled in v1.
