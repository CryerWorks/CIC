# Quickstart: AI Feynman / Socratic Tutor (018)

**Feature**: 018-feynman-tutor | **Date**: 2026-06-12

## Prerequisites

- CIC running in `tauri dev`
- AI provider configured with a reasoning-capable provider (Ollama, OpenAI-compatible, or Anthropic)
- At least one vault connected with at least one Course
- At least one ingested Resource or indexed vault note (from 017) for RAG grounding

## Scenario A: Open Feynman Panel from Daily Loop (P1)

1. Plan and start a session from the Daily Loop.
2. Navigate to the **Self-Test / Feynman** step.
3. Click **"Feynman Tutor"**.
4. **Verify**: A chat panel opens with a text input. An intro message from the tutor appears: "I'll help you find gaps in your understanding. Explain a concept you're studying and I'll ask questions to probe your knowledge."

## Scenario B: Basic Conversation (P1)

1. In the Feynman Panel, type an explanation of a concept related to your ingested Resources (e.g., "The chain rule lets you differentiate composite functions by multiplying the derivative of the outer function by the derivative of the inner function").
2. Press Enter or click Send.
3. **Verify**:
   - A typing indicator appears ("Feynman tutor is thinking…")
   - Within 10 seconds, the AI response starts streaming in (word by word or sentence by sentence)
   - The response is a question, not an explanation
   - The conversation history is visible (learner message on the right, tutor response on the left)

## Scenario C: RAG-Grounded Question (P1)

1. Start a conversation about a topic that has an ingested Resource (e.g., a calculus textbook).
2. Explain the concept from that Resource.
3. **Verify**: The AI's question references the Resource with a citation like "*Your textbook, Chapter 3: Derivatives*" and asks how something in the learner's explanation relates to the cited content.

## Scenario D: Multi-Turn Conversation (P1)

1. Respond to the AI's question with another explanation.
2. **Verify**:
   - The AI follows up with another question that probes deeper or in a different direction
   - The AI never lectures, never answers its own question
   - After 5+ turns, the AI is still asking questions, not explaining

## Scenario E: Summarize Gaps (P2)

1. After 3+ turns in the conversation, click **"Summarize Gaps"**.
2. **Verify**:
   - Within a few seconds, a list of identified knowledge gaps appears
   - Each gap is a specific thing the learner needs to learn or clarify
   - The gap list is displayed below the conversation

## Scenario F: Save Gaps to Session Writeup (P2)

1. From the Daily Loop context (Scenario A), run a conversation, click Summarize Gaps.
2. Click **"Save to Session"**.
3. **Verify**:
   - Confirmation: "N gaps saved to session writeup."
   - Open the session writeup in Obsidian — the gaps appear as `- [ ]` checkbox items under `## Gaps from Feynman`
   - In CIC, the Dashboard shows a "Gaps to Chase" tile with the count

## Scenario G: Save Gaps as Standalone Note (P2)

1. Open the Feynman Panel from the Course detail page (not the Daily Loop).
2. Run a conversation, Summarize Gaps, click **"Save as Note"**.
3. **Verify**:
   - A new vault note is created with `cic-type: feynman-gaps` frontmatter
   - The note contains `## Gaps from Feynman` with `- [ ]` checkbox items
   - The Dashboard "Gaps to Chase" tile includes these gaps

## Scenario H: Citation Click-Through (P3)

1. In a conversation where the AI cited a Resource, click the citation (e.g., "*Your textbook, Chapter 3*").
2. **Verify**: The Resource opens at the cited locator (e.g., PDF opens at the chapter page, or the vault note opens in Obsidian).

## Scenario I: Uncertainty Flag (P3)

1. Start a conversation on a math concept without any ingested Resources or indexed notes for that topic.
2. Explain the concept.
3. **Verify**: The AI's response includes an uncertainty flag like "⚠️ I'm reasoning from general knowledge here — verify this against your sources."

## Scenario J: Lockdown Mode Block

1. In **Settings → AI**, enable **Local-only lockdown**.
2. Ensure the configured reasoning provider is remote.
3. Open the Feynman Panel.
4. **Verify**: The panel shows "Feynman tutor unavailable in local-only mode — the reasoning provider is remote." The chat input is disabled. No chat requests are made.

## Scenario K: Provider Offline

1. Stop the local Ollama server (or disconnect from network for remote providers).
2. Open the Feynman Panel and send a message.
3. **Verify**: Within 5 seconds, a clear error message appears: "AI provider unavailable. Check Settings → AI." The conversation history remains visible.

## Scenario L: Dashboard Gap Reconciliation

1. After Scenario F, open the vault note in Obsidian and manually mark a gap as complete (`- [ ]` → `- [x]`).
2. In CIC, navigate to the Dashboard.
3. **Verify**: The "Gaps to Chase" tile still shows the old count (DB hasn't reconciled yet).
4. Trigger a vault rescan (or reopen the Dashboard).
5. **Verify**: The completed gap is no longer counted — the count decreased by one.

## Automated Checks

```bash
npm run test          # Vitest — all tests green
npm run lint          # ESLint — clean
npm run tsc           # TypeScript strict — clean
```
