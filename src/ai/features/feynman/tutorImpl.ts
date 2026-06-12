import type { FeynmanMessage, FeynmanGap, GapSaveTarget } from "./types";
import type { ChatMessage, ChatOptions } from "../../provider";
import type { AIRole } from "../../config";
import { buildSocraticPrompt } from "./prompt";

interface SearchFn {
  (query: string, k?: number): Promise<Array<{ chunk: { sourceTitle: string; textContent: string; headingPath: string | null; sourceKind: string; sourceId: string }; distance: number; resourceId: string | null; locator: string }>>;
}

interface GapWriter {
  writeGaps(gaps: FeynmanGap[], target: GapSaveTarget): Promise<void>;
}

interface GapStore {
  insertGaps(gaps: Array<{ id: string; vaultId: string; courseId: string | null; notePath: string; text: string }>): Promise<void>;
}

/** Shape of the chat chunk yielded by the router. Matches ChatChunk.delta. */
interface ChatChunkLike {
  delta: string;
}

const GAP_SUMMARIZE_PROMPT = `Based on the conversation above, list the specific knowledge gaps the learner has. Output as a bullet list — one gap per bullet. Each gap should be one clear sentence describing what the learner needs to learn or clarify. Do not include explanations or advice — just list the gaps.`;

export class FeynmanTutorImpl {
  private _messages: FeynmanMessage[] = [];
  private _scope: { courseId?: string } | null = null;
  private _isActive = false;

  constructor(
    private router: { chat: (role: AIRole, messages: ChatMessage[], opts: ChatOptions) => AsyncIterable<ChatChunkLike> },
    private searchFn: SearchFn,
    private vaultId: string,
    private gapWriter: GapWriter,
    private gapStore: GapStore,
  ) {}

  get isActive(): boolean {
    return this._isActive;
  }

  startConversation(scope?: { courseId?: string }): void {
    this._messages = [];
    this._scope = scope ?? null;
    this._isActive = false;
  }

  getMessages(): FeynmanMessage[] {
    return this._messages;
  }

  async *sendMessage(text: string): AsyncIterable<string> {
    this._isActive = true;

    // 1. RAG retrieval
    let contextChunks: string[] = [];
    try {
      const filter: { courseId?: string } = {};
      if (this._scope?.courseId) filter.courseId = this._scope.courseId;
      const results = await this.searchFn(text, 5);
      contextChunks = results.map((r) => {
        const locator = r.locator || r.chunk.headingPath || "";
        const sourceStr = locator ? `[source: ${r.chunk.sourceTitle}, ${locator}] ` : `[source: ${r.chunk.sourceTitle}] `;
        return sourceStr + r.chunk.textContent;
      });
    } catch {
      // RAG failure is non-blocking — continue without context
    }

    // 2. Add learner message
    this._messages.push({ role: "learner", content: text });

    // 3. Build prompt
    const chatMessages = buildSocraticPrompt({
      messages: this._messages.slice(0, -1), // exclude the just-added learner message
      contextChunks,
      learnerText: text,
    });

    // 4. Stream AI response
    const tutorMsg: FeynmanMessage = { role: "tutor", content: "", isStreaming: true };
    this._messages.push(tutorMsg);

    try {
      for await (const chunk of this.router.chat("reasoning", chatMessages, { containsVaultContent: true })) {
        const delta = chunk.delta ?? "";
        tutorMsg.content += delta;
        yield delta;
      }
    } catch (e) {
      tutorMsg.content += `\n\n_Error: ${e instanceof Error ? e.message : "AI provider unavailable"}_`;
    } finally {
      tutorMsg.isStreaming = false;
      this._isActive = false;
    }
  }

  async summarizeGaps(): Promise<FeynmanGap[]> {
    // Build conversation transcript for the summary request
    const transcript = this._messages
      .map((m) => `${m.role === "learner" ? "Learner" : "Tutor"}: ${m.content}`)
      .join("\n\n");

    const summaryMessages: ChatMessage[] = [
      { role: "system", content: GAP_SUMMARIZE_PROMPT },
      { role: "user", content: `Here is our conversation:\n\n${transcript}\n\nList the gaps:` },
    ];

    let summaryText = "";
    try {
      for await (const chunk of this.router.chat("reasoning", summaryMessages, { containsVaultContent: true })) {
        summaryText += chunk.delta ?? "";
      }
    } catch {
      return [];
    }

    // Parse bullet points from the summary
    return summaryText
      .split("\n")
      .filter((line) => line.trim().startsWith("-") || line.trim().startsWith("*"))
      .map((line) => ({
        text: line.replace(/^[-*]\s*/, "").trim(),
      }))
      .filter((g) => g.text.length > 0);
  }

  async saveGaps(gaps: FeynmanGap[], target: GapSaveTarget): Promise<number> {
    if (gaps.length === 0) return 0;

    // Dual write: vault first (canonical), then DB (mirror)
    let dbWritten = false;
    try {
      await this.gapWriter.writeGaps(gaps, target);
    } catch {
      // Vault write failed — still persist DB row so gap is never lost (FR-014)
    }

    try {
      const rows = gaps.map((g) => ({
        id: crypto.randomUUID(),
        vaultId: this.vaultId,
        courseId: target.courseId ?? null,
        notePath: target.notePath,
        text: g.text,
      }));
      await this.gapStore.insertGaps(rows);
      dbWritten = true;
    } catch {
      // DB write failed — gaps are in vault if that succeeded
    }

    return dbWritten ? gaps.length : 0;
  }
}
