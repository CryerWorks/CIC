# SPEC: AI Feynman / Socratic Tutor (F4)

**Feature**: 018-feynman-tutor

Full spec at `specs/018-feynman-tutor/spec.md`. Key contracts extracted below.

## Contracts

### FeynmanTutor Interface (already implemented in `src/ai/features/feynman/tutorImpl.ts`)

```ts
interface FeynmanTutor {
  startConversation(scope?: { courseId?: string }): void;
  sendMessage(text: string): AsyncIterable<string>;
  getMessages(): FeynmanMessage[];
  summarizeGaps(): Promise<FeynmanGap[]>;
  saveGaps(gaps: FeynmanGap[], target: GapSaveTarget): Promise<number>;
  isActive: boolean;
}
```

### useFeynmanTutor() Hook (T011)

```ts
function useFeynmanTutor(scope?: { courseId?: string }): {
  messages: FeynmanMessage[];
  isActive: boolean;
  error: string | null;
  sendMessage(text: string): Promise<void>;
  summarizeGaps(): Promise<FeynmanGap[]>;
  saveGaps(gaps: FeynmanGap[], target: GapSaveTarget): Promise<number>;
  reset(): void;
}
```

### Types

```ts
interface Citation {
  sourceName: string;
  locator: string;
  sourceKind: "resource" | "note";
  sourceId: string;
}

interface FeynmanMessage {
  role: "learner" | "tutor";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

interface FeynmanGap {
  text: string;
  sourceName?: string;
}

interface GapSaveTarget {
  type: "session-writeup" | "standalone-note";
  notePath: string;
  courseId?: string;
}
```

### feynmanGaps Repository (T020)

```ts
interface FeynmanGapsRepo {
  insertGaps(gaps: FeynmanGapInsert[]): Promise<void>;
  listOpenGaps(vaultId: string): Promise<FeynmanGapRow[]>;
  getOpenGapCountByCourse(vaultId: string): Promise<Array<{ courseId: string | null; courseTitle: string | null; count: number }>>;
  reconcileCompleted(vaultId: string): Promise<number>;
}

interface FeynmanGapInsert {
  id: string;
  vaultId: string;
  courseId: string | null;
  notePath: string;
  text: string;
}
```

### Gap Vault Writer (T021)

```ts
function writeGapsToVault(gaps: FeynmanGap[], target: GapSaveTarget, vaultWriter: VaultWriter): Promise<void>;
```

### FeynmanPanel Component (T014)

```tsx
interface FeynmanPanelProps {
  gapSaveTarget: GapSaveTarget;
  onClose: () => void;
}
```

### Access points
- T015: `SelfTestStep.tsx` — "Feynman Tutor" button, opens panel with `gapSaveTarget.type: "session-writeup"`
- T016: Course detail — "Feynman Tutor" button, scoped to `courseId`
- T017: Search Corpus — "Feynman Tutor" button, no course scope

### Dashboard (T024)
- Query `getOpenGapCountByCourse(vaultId)` 
- Render as tile `Gaps to Chase` with per-course counts
- "Refresh gaps" button (T032) triggers `reconcileCompleted()`
