# Research: AI Feynman / Socratic Tutor (018)

**Feature**: 018-feynman-tutor | **Date**: 2026-06-12

## R1: Socratic Prompt Design

### Decision: Structured system prompt with explicit behavior constraints + RAG context injection

**Rationale**: The Socratic tutor requires a carefully designed prompt that enforces: ask one question at a time, never lecture, never answer its own question, ground in provided context, flag uncertainty in technical domains. Rather than embedding prompt logic in the tutor module, the prompt is a versioned string in `src/ai/prompts/socratic.ts` — following the 016 pattern of centralized, version-controlled prompts.

**Prompt structure**:
```
You are a Socratic tutor using the Feynman technique. Your role is to help the learner
find gaps in their understanding through questioning, not to teach or explain.

RULES (never break these):
1. Ask ONE question at a time. Wait for the learner's response.
2. NEVER lecture, explain, or answer your own question.
3. Ground your questions in the PROVIDED CONTEXT (below) when available.
4. In technical domains (math, physics, proofs), if you're reasoning from general
   knowledge rather than the provided context, prefix with: "⚠️ I'm reasoning from
   general knowledge — verify this against your sources."
5. When citing from the provided context, include the source name and locator in your
   question: "[source: Chapter X, p.Y] ...your question..."
6. If the learner's explanation is very short or vague, ask them to elaborate:
   "Can you tell me a bit more? What do you think is the key idea here?"
7. Your goal is to find what the learner DOESN'T know, not to confirm what they do.
   Probe the edges of their understanding.

PROVIDED CONTEXT (from the learner's own materials):
--- BEGIN CONTEXT ---
{retrieved_chunks}
--- END CONTEXT ---
```

**Alternatives considered**:
- Dynamic prompt per topic: adds complexity without proven benefit. The same Socratic stance works across domains.
- No system prompt (just user messages): the model loses the Socratic stance after a few turns.
- Prompt stored in DB: unnecessary — the prompt is immutable for a given version, not user-configurable.

**Locked: Structured system prompt in `src/ai/prompts/socratic.ts`. Version-controlled.**

---

## R2: Streaming Chat Consumption

### Decision: Reuse existing SSE/NDJSON streaming from 016 adapters

**Rationale**: The 016 provider layer already handles SSE (Anthropic) and NDJSON (Ollama/OpenAI-compatible) streaming. The `router.chat()` method returns an `AsyncIterable<ChatMessage>` that yields tokens as they arrive. The Feynman panel consumes this stream and renders incrementally.

**Integration**: The `FeynmanTutor.sendMessage()` method:
1. Retrieves RAG context via `useRAG().search(learnerMessage, k=5)`
2. Formats context + conversation history + system prompt
3. Calls `router.chat('reasoning', messages, {containsVaultContent: true})` with `stream: true`
4. Yields each token to the UI via a callback/state-setter

**Typing indicator**: The panel shows "Feynman tutor is thinking…" while the first token hasn't arrived yet. Once tokens stream in, the indicator disappears and the message grows incrementally.

**No new npm deps, no new Rust commands.** Streaming is already wired in 016.

**Locked: Reuse existing streaming from 016.**

---

## R3: Gap Persistence — Hybrid Vault + SQLite

### Decision: Dual write — vault Markdown as canonical, `feynman_gaps` SQLite table as read-optimized mirror

**Rationale**: Per the clarification decision (Session 2026-06-12), gaps are written to both:
1. **Vault**: `- [ ]` checkbox items under `## Gaps from Feynman` in the target note (session writeup or standalone note) via `VaultWriter` — **canonical**.
2. **SQLite**: `feynman_gaps` row with vault_id, course_id, note_path, text, status, created_at — **read mirror**.

**Vault write path**: `VaultWriter.mergeNote(notePath)` — appends gaps section if not present, or merges new gaps into existing section. Never clobbers user-owned content outside the `## Gaps from Feynman` section.

**DB write path**: `feynmanGaps.insertGaps()` — batch inserts rows.

**Drift reconciliation**: On vault rescan (or explicit "Refresh gaps" from Dashboard):
- Scan all vault files for `- [x]` completed items under `## Gaps from Feynman`
- Update corresponding `feynman_gaps` rows to `status: completed`
- Open gaps in vault that are marked complete in DB → vault is canonical, so DB updates to match the vault — never the reverse

**This follows the established pattern**:
- 007: MOC drift → `reapplyCourse` corrects vault (app-managed sections)
- 015: Projects frontmatter drift → rescan updates DB from vault
- 017: Note indexing rescan → cleans orphaned chunks

**Locked: Hybrid vault + SQLite. Vault canonical. Drift reconciles DB ← vault.**

---

## R4: Migration m0010 — feynman_gaps Table

### Decision: Additive migration adding `feynman_gaps` table

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS feynman_gaps (
  id TEXT PRIMARY KEY,                     -- UUID
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  note_path TEXT NOT NULL,                 -- vault-relative path of the note containing gaps
  text TEXT NOT NULL,                      -- gap description
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feynman_gaps_vault ON feynman_gaps(vault_id);
CREATE INDEX IF NOT EXISTS idx_feynman_gaps_course ON feynman_gaps(course_id);
```

**Design notes**:
- `course_id` is nullable — gaps from non-Course contexts (global Feynman panel) have no course.
- `note_path` stores the vault-relative path of the note where the gap checkbox lives — enables drift reconciliation by scanning that specific file.
- `status` is "open" or "completed" — simple state machine, no intermediate states.
- `ON DELETE CASCADE` for vault — deleting a vault cleans all its gaps.
- `ON DELETE SET NULL` for course — deleting a course ungroups its gaps (they become global gaps).

**Locked: m0010 as above.**

---

## R5: LaTeX / Math Rendering

### Decision: No LaTeX renderer for v1 — render math as plain text / Markdown code blocks

**Rationale**: The spec mentions LaTeX rendering in the edge cases and assumptions, but CIC currently has no math renderer dependency. Adding KaTeX (~2KB gzipped, ~50KB full) adds weight for a feature that primarily serves learners in math/physics domains. For v1, AI responses containing math are displayed as plain text or fenced code blocks.

**Fallback**: If the AI outputs `$$...$$` or `$...$` LaTeX, the panel preserves the markup so the learner can copy it into Obsidian (which renders LaTeX natively). Obsidian is where the learner actually works with math — the Feynman panel is the interrogation surface, not the typesetting surface.

**Future**: Add KaTeX in a later polish iteration if learners request in-app math rendering.

**Locked: No LaTeX renderer for v1. Markup preserved for Obsidian.**

---

## R6: Test Strategy

### Decision: Mock chat router returning deterministic Socratic responses

**Rationale**: The Feynman tutor cannot depend on a real AI provider for tests. Instead:
1. **Unit tests**: Inject a `fakeRouter` that returns predefined `ChatMessage` streams. Test prompt assembly, citation formatting, gap parsing, vault-write orchestration.
2. **Integration tests**: Chain `tutor.sendMessage()` → `tutor.saveGaps()` with fake router + fake RAG search + fake `VaultWriter` (InMemoryWriteLog) + in-memory SQLite (`better-sqlite3`).
3. **UI tests**: Render `FeynmanPanel` with mock `useFeynmanTutor()` hook, test conversation flow, gap display, save button.

**Fake router responses**:
```ts
const fakeRouter = {
  chat: async function* () {
    yield "That's interesting. ";
    yield "Can you explain more about ";
    yield "how the chain rule relates to implicit differentiation?";
  }
};
```

**Locked: Mock chat router. No real AI calls in tests.**
