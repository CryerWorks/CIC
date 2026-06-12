# Feature Specification: AI Feynman / Socratic Tutor (F4)

**Feature Branch**: `018-feynman-tutor`

**Created**: 2026-06-12

**Status**: Draft

**Input**: F4 — AI Feynman / Socratic Interrogation. The learner explains a concept; the AI plays the probing beginner / Socratic examiner and finds gaps. RAG-grounded in the learner's own vault notes + ingested Resources (017). Tutor-not-oracle guardrails: cite grounding source, flag uncertainty. Gap logging: identified gaps written as tasks in session writeup. Uses `router.chat('reasoning', …)` from 016 and search from 017.

## Clarifications

### Session 2026-06-12

- Q: How does the Dashboard discover and count saved gaps if they're written as `- [ ]` items in vault Markdown files? → A: Hybrid — gaps are written to vault (as `- [ ]` checkbox items, the canonical copy) AND stored in a new SQLite `feynman_gaps` table for fast querying + Course grouping. The Dashboard reads from SQLite. A vault rescan reconciles drift (user marked done in Obsidian → marked complete in DB). Follows the established pattern from 007 MOC drift, 015 Projects frontmatter drift, and 017 note indexing rescan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Feynman Conversation (Priority: P1)

A learner is studying a concept (e.g., "the chain rule in calculus" or "monads in functional programming"). They open the Feynman Panel from anywhere in the app (Daily Loop self-test step, Course detail, or the Search Corpus page), type or speak their understanding of the concept, and the AI responds as a curious, probing beginner — asking one question at a time, seeking clarification, exposing gaps. The AI's questions are grounded in the learner's own vault notes and ingested Resources (RAG retrieval from 017), so it asks about *what the learner should know based on their own materials*, not generic textbook questions. The conversation continues as a back-and-forth until the learner feels they've identified the gaps or wants to stop.

**Why this priority**: This is the headline AI feature — the first consumer of both `router.chat()` (016) and RAG retrieval (017). It's the moment the platform becomes a tutor instead of a tracker. Socratic interrogation is a proven learning technique (elaboration + self-explanation) and the RAG grounding makes it personal — it finds gaps in *your* understanding, not generic gaps.

**Independent Test**: Open the Feynman Panel, enter an explanation of a concept that has ingested Resources and/or indexed notes, get a probing question grounded in that material, respond, get another question — verify the conversation stays on-topic and references the learner's own sources.

**Acceptance Scenarios**:

1. **Given** a learner on a Course with at least one ingested Resource, **When** they open the Feynman Panel and explain a concept, **Then** the AI responds with a probing question that references the Resource (e.g., "In Chapter 3 of your textbook, it mentions X. How does that relate to what you just said?")
2. **Given** a learner with no ingested Resources or indexed notes for the topic, **When** they open the Feynman Panel and explain a concept, **Then** the AI responds with probing questions from general knowledge (still with uncertainty flags in technical domains).
3. **Given** an active Feynman conversation, **When** the learner responds to the AI's question, **Then** the AI follows up with another question that probes deeper or in a different direction — never lectures, never answers its own question.
4. **Given** a Feynman conversation, **When** the learner clicks "Summarize Gaps", **Then** the AI produces a summary of identified gaps that the learner can review and optionally save to the session writeup or course notes.

---

### User Story 2 - Gap Tracking + Writeback (Priority: P2)

After a Feynman conversation, the learner sees identified knowledge gaps. They can save these as `- [ ]` tasks in the current session's writeup (if launched from the Daily Loop) or as a standalone note in the vault. The gaps are written through `VaultWriter` as clean Markdown checkboxes in the existing session writeup or a new note. Saved gaps also appear on the Dashboard as "to chase."

**Why this priority**: The Feynman conversation is valuable in the moment, but the gaps it finds need to persist — otherwise the insight is lost. Gap writeback is what closes the loop between "finding what you don't know" and "going and learning it." Lower priority than P1 because the conversation is independently usable even without persistence.

**Independent Test**: Run a Feynman conversation, click "Save gaps to session", verify the gaps appear as `- [ ]` tasks in the current session's writeup file in the vault. Verify they appear in the "to chase" section on the Dashboard.

**Acceptance Scenarios**:

1. **Given** a completed Feynman conversation launched from the Daily Loop, **When** the learner clicks "Save gaps to session", **Then** the identified gaps are appended as `- [ ]` checkbox items under a `## Gaps from Feynman` section in the session writeup Markdown file.
2. **Given** a completed Feynman conversation launched from outside the Daily Loop (e.g., Course detail), **When** the learner clicks "Save gaps", **Then** gaps are written as a new standalone note in the vault with `cic-type: feynman-gaps` frontmatter.
3. **Given** saved gaps, **When** the learner views the Dashboard, **Then** a "Gaps to Chase" tile shows the count of open gap tasks, grouped by Course.
4. **Given** a gap task in a session writeup, **When** the learner marks it complete in Obsidian or the app, **Then** the Dashboard tile count updates on next refresh.

---

### User Story 3 - Source Citation (Priority: P3)

Throughout the Feynman conversation, the AI's responses cite specific sources: ingested Resources (with locator like "Chapter 3, p.45") and vault notes (with file name). Each citation is a clickable link that opens the source at the cited locator (reusing the existing opener from 010/011). The AI never asserts correctness without attribution — in technical domains (math, physics, proofs), it explicitly flags when it's reasoning from general knowledge rather than the learner's sources.

**Why this priority**: Citations are the "tutor-not-oracle" guardrail in action — they make the AI's grounding transparent. The learner can verify every claim against the source. Lower priority because the conversation works without inline citations (grounding still happens via retrieval, just not shown), but citations are essential for trust.

**Independent Test**: Start a Feynman conversation on a topic with ingested Resources, verify that AI responses include source citations (resource name + locator), verify clicking a citation opens the Resource.

**Acceptance Scenarios**:

1. **Given** a Feynman conversation grounded in an ingested Resource, **When** the AI references specific content from that Resource, **Then** the response includes a citation like "*Your textbook, Chapter 3: Derivatives*" and the citation is clickable to open the Resource at that locator.
2. **Given** a Feynman conversation on a math concept, **When** the AI reasons about the proof without a grounding source, **Then** the response includes an uncertainty flag like "⚠️ I'm reasoning from general knowledge here — verify this against your sources."
3. **Given** a Feynman conversation grounded in an indexed vault note, **When** the AI references that note, **Then** the response includes a citation like "*From your note: `Calculus/chain-rule.md`*" and the citation opens the vault note.

---

### Edge Cases

- What happens when the AI provider is offline or returns an error? The conversation panel shows a clear error message ("AI provider unavailable. Check Settings → AI.") and the conversation history remains visible so the learner doesn't lose their work.
- What happens during lockdown mode with a remote reasoning provider? The Feynman Panel is entirely blocked with a message "Feynman tutor unavailable in local-only mode — the reasoning provider is remote." The RAG retrieval step (which is embedding-based and may use a local provider) still works for search, but the chat cannot proceed.
- What happens when the conversation context grows too large? The system truncates the oldest messages beyond a configurable window (default 20 message pairs), keeping the most recent context + the grounding chunks from the latest retrieval.
- What happens when a cited Resource has been deleted? The citation text remains but the link is grayed out / non-clickable with a "(source removed)" indicator.
- What happens when the learner provides an empty or extremely short explanation? The AI prompts for more detail: "Can you tell me a bit more? What do you think is the key idea here?"
- What happens during long responses / streaming? The UI shows a typing indicator while the response streams in (reusing the SSE streaming from 016 for Anthropic/OpenAI).
- What happens when the AI's response includes LaTeX or code? LaTeX (math) and code blocks render correctly in the conversation panel.
- What happens when the learner navigates away mid-conversation? The conversation is lost — no auto-save (the learner explicitly saves gaps at the end). A confirmation dialog warns before navigation.
- What happens when a gap is marked complete in Obsidian but the DB still shows it as open? The next vault rescan reconciles: scans for `- [x]` items under `## Gaps from Feynman` headings and updates the corresponding `feynman_gaps` row to `status: completed`. This follows the established drift-reconciliation pattern from 007 MOC drift, 015 Projects frontmatter, and 017 note indexing.

## Requirements *(mandatory)*

### Functional Requirements

**Conversation**

- **FR-001**: System MUST provide a Feynman Panel accessible from the Daily Loop self-test step, Course detail pages, and the Search Corpus page via a consistent "Feynman" button.
- **FR-002**: System MUST send the learner's explanation + conversation history + retrieved RAG context to `router.chat('reasoning', messages, {containsVaultContent: true})` per Constitution II.
- **FR-003**: System MUST prompt the AI with a system instruction that enforces Socratic behavior: ask one question at a time, probe gaps, never lecture, never answer its own question, ground questions in the provided context.
- **FR-004**: System MUST display AI responses as they stream (SSE/NDJSON), with a typing indicator while the response is being generated.
- **FR-005**: System MUST preserve conversation history within the session — the learner can scroll back through the exchange.
- **FR-006**: System MUST allow the learner to end the conversation and trigger gap summarization at any point.

**RAG Grounding**

- **FR-007**: Before each AI response, System MUST retrieve the top-k most relevant chunks (default k=5) from the RAG corpus via the existing `useRAG().search()` (017), using the learner's last explanation as the query.
- **FR-008**: System MUST scope RAG retrieval to the active vault and optionally to the current Course (when launched from Course context).
- **FR-009**: System MUST include the retrieved chunks' text, source names, and locators inline in the prompt context so the AI can cite them.

**Guardrails**

- **FR-010**: System MUST enforce the lockdown gate: if lockdown is ON and the effective reasoning provider is remote, the Feynman Panel MUST be blocked entirely with a clear user-facing message (Constitution II).
- **FR-011**: System MUST include an explicit instruction in the prompt: "In technical domains (math, physics, proofs), flag uncertainty when reasoning from general knowledge rather than the provided sources. Never assert correctness without attribution."
- **FR-012**: System MUST include source name + locator in every cited reference; citations MUST be clickable to open the source (reusing existing opener from 010/011).

**Gaps**

- **FR-013**: System MUST offer a "Summarize Gaps" action that prompts the AI to list the identified knowledge gaps from the conversation.
- **FR-014**: System MUST save gaps to both destinations: the vault (as `- [ ]` checkbox items via `VaultWriter` — the canonical copy) AND a `feynman_gaps` SQLite table (for fast Dashboard querying + Course grouping). Both writes MUST happen in the same logical operation; a vault-write failure MUST still persist the DB row so the gap is never silently lost.
- **FR-015**: System MUST write saved gaps through `VaultWriter` using atomic write (never clobber, never corrupt existing content).
- **FR-016**: System MUST surface saved gap counts on the Dashboard as a "Gaps to Chase" tile by querying the `feynman_gaps` SQLite table (fast, indexed), grouped by Course where applicable. When the learner marks a gap complete in Obsidian, the next vault rescan reconciles the drift (updates the DB row to `status: completed`).

**Data**

- **FR-020**: System MUST include an additive migration adding a `feynman_gaps` table (id, vault_id, course_id nullable, note_path, text, status 'open'|'completed', created_at) for fast Dashboard querying and Course-grouped gap counts. The vault `- [ ]` checkbox remains the canonical copy; the DB row is a read-optimized mirror.
- **FR-021**: System MUST reconcile drift between vault `- [ ]` checkboxes and `feynman_gaps` rows via a vault rescan: scan vault files for `- [x]` completed items under `## Gaps from Feynman` headings, update the corresponding DB row to `status: completed`. Open gaps in the vault that are marked complete in the DB (user marked done in the app) stay as-is — vault is canonical, not the DB.

**Resilience**

- **FR-017**: System MUST handle AI provider errors gracefully: display a clear error message, preserve conversation history, offer retry.
- **FR-018**: System MUST warn before navigation away from an active Feynman conversation with unsaved gaps.
- **FR-019**: System MUST truncate conversation context beyond a configurable window (default 20 message pairs) to stay within provider token limits, keeping the most recent messages + grounding chunks.

### Key Entities

- **Feynman Conversation**: A back-and-forth exchange between the learner and the AI tutor. Ephemeral — persists only while the panel is open. Composed of messages (learner messages + AI responses with citations). Ends with an optional gap summary.
- **Feynman Gap**: A knowledge gap identified by the AI during the conversation. Attributes: description (the gap text), source (which resource/note it relates to), status (open or completed). Written to two locations: (1) vault as a `- [ ]` checkbox item under `## Gaps from Feynman` in a session writeup or standalone note — the canonical copy; (2) SQLite `feynman_gaps` row (id, vault_id, course_id, note_path, text, status, created_at) — the read-optimized mirror for fast Dashboard querying and Course grouping. Drift reconciliation via vault rescan keeps them in sync.
- **Citation**: A reference from an AI response to a specific source (Resource or vault note) with a locator (heading/TOC path). Clickable to open the source.

## Success Criteria *(mandatory)*

- **SC-001**: A learner can start a Feynman conversation from the Daily Loop, explain a concept, and receive a probing question grounded in their own materials in under 10 seconds (including RAG retrieval + AI response streaming start).
- **SC-002**: In a 10-turn Feynman conversation, the AI never lectures and never answers its own question — every AI turn is a question or a gap-identification, not an explanation (100% compliance across 10 conversations).
- **SC-003**: A learner can save identified gaps to a session writeup and see them appear as `- [ ]` checkbox items in the vault within 5 seconds of clicking "Save."
- **SC-004**: When a grounding source is available, AI responses include at least one citation per turn (covers 80% of AI responses in RAG-grounded conversations).
- **SC-005**: When lockdown mode is ON and the reasoning provider is remote, the Feynman Panel is blocked with a clear message — zero chat requests reach the provider.
- **SC-006**: Saved gaps appear on the Dashboard within one page refresh after saving.
- **SC-007**: A Feynman conversation with an offline AI provider shows a clear error message within 5 seconds — no crash, no blank screen.

## Assumptions

- **RAG corpus already exists**: The Feynman tutor requires at least one ingested Resource or indexed note for full grounding. When the corpus is empty, the tutor falls back to general-knowledge questioning with uncertainty flags (FR-011). This is consistent with Phase 3 delivery order: provider layer (016) → RAG (017) → tutor (018).
- **LaTeX rendering**: Math rendering uses an existing or lightweight LaTeX renderer (e.g., KaTeX, already in many Obsidian setups). Block-level math (`$$...$$`) and inline math (`$...$`) in AI responses render correctly.
- **Course-level scoping is additive**: When launched from a Course context, RAG retrieval filters to that Course's Resources + notes. When launched from the global Feynman panel, retrieval is vault-wide. The learner can optionally scope to a Course.
- **Conversation is ephemeral**: Feynman conversations are not persisted to the database — they exist only while the panel is open. Only saved gaps are persisted. Full conversation history persistence could be added later but is not in v1.
- **One conversation at a time**: Only one Feynman conversation can be active. Opening the panel resets the conversation. The learner explicitly saves gaps before starting a new topic.
- **Prompt is versioned**: The Socratic system prompt lives in `src/ai/prompts/` (consistent with 016's prompt management pattern) and is version-controlled for reproducibility.
