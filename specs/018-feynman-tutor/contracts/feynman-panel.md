# Interface Contract: Feynman Panel

**Feature**: 018-feynman-tutor | **Serves**: P1 conversation, P2 gap tracking, P3 citations

## Purpose

The `FeynmanTutor` interface is the seam between the UI panel and the AI chat + RAG retrieval + gap persistence layers. Features consume a `useFeynmanTutor()` hook; the hook orchestrates `router.chat()`, `useRAG().search()`, and `VaultWriter` / `feynmanGaps` repo.

## Contract

```ts
// src/ai/features/feynman/tutor.ts

export interface Citation {
  sourceName: string;
  locator: string;
  sourceKind: 'resource' | 'note';
  sourceId: string;  // resources.id or note_path
}

export interface FeynmanMessage {
  role: 'learner' | 'tutor';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;  // true while response is still being generated
}

export interface FeynmanGap {
  text: string;
  sourceName?: string;  // which resource/note the gap relates to
}

export interface GapSaveTarget {
  type: 'session-writeup' | 'standalone-note';
  notePath: string;       // target vault file path
  courseId?: string;      // for course grouping
}

export interface FeynmanTutor {
  /** Start a new conversation. Resets history. */
  startConversation(scope?: { courseId?: string }): void;

  /** Send the learner's message. Returns a stream of AI response tokens. */
  sendMessage(text: string): AsyncIterable<string>;

  /** Get the current conversation messages (for rendering). */
  getMessages(): FeynmanMessage[];

  /** Summarize identified gaps from the conversation so far. Returns gap list. */
  summarizeGaps(): Promise<FeynmanGap[]>;

  /** Save identified gaps to vault + SQLite. Returns count of gaps saved. */
  saveGaps(gaps: FeynmanGap[], target: GapSaveTarget): Promise<number>;

  /** Whether the tutor is currently generating a response */
  isActive: boolean;
}
```

## Hook Contract

```ts
// src/ai/features/feynman/hooks/useFeynmanTutor.ts

export function useFeynmanTutor(scope?: { courseId?: string }): {
  // Conversation state
  messages: FeynmanMessage[];
  isActive: boolean;
  error: string | null;

  // Actions
  sendMessage(text: string): Promise<void>;
  summarizeGaps(): Promise<FeynmanGap[]>;
  saveGaps(gaps: FeynmanGap[], target: GapSaveTarget): Promise<number>;
  reset(): void;
}
```

## Panel Component Contract

```tsx
// src/features/feynman/FeynmanPanel.tsx

interface FeynmanPanelProps {
  /** Target for gap saves (auto-detected from context: Daily Loop → session writeup, Course → standalone) */
  gapSaveTarget: GapSaveTarget;
  /** Called when the learner closes the panel */
  onClose: () => void;
}

// Renders:
// 1. Chat messages (scrollable, learner right-aligned, tutor left-aligned)
// 2. Input field at bottom (text input + send button)
// 3. Typing indicator while AI is generating
// 4. "Summarize Gaps" button (appears after 2+ turns)
// 5. Gap list with "Save to [target]" button
// 6. Error banner (provider offline, lockdown, etc.)
```

## Invariants

1. **Lockdown gate**: Before any `router.chat()` call, check lockdown. If ON and reasoning provider is remote → block with message. No chat request reaches a remote provider under lockdown.
2. **RAG grounding before every response**: `sendMessage()` MUST call `useRAG().search(learnerText, k=5, {courseId})` before calling `router.chat()`. The retrieved chunks are injected into the prompt context.
3. **VaultWriter only**: All vault writes go through `VaultWriter.mergeNote()` — never `fs.writeFile` or direct file I/O on vault paths.
4. **Dual write atomicity**: `saveGaps()` writes to vault first (canonical), then to SQLite (mirror). A vault-write failure still persists the DB row so the gap is never silently lost.
5. **Conversation is ephemeral**: No conversation history is persisted. Only explicitly saved gaps survive panel close.
