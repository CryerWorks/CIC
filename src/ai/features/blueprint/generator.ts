/**
 * BlueprintGenerator — Mode A conversational sparring + Mode B RAG synthesis.
 *
 * Mode A: Multi-turn guided dialogue via router.chat('reasoning', …) where the AI
 * acts as a Campaign Architect. Streams responses token by token. When the AI emits
 * a JSON code block, `extractBlueprint()` parses it into a CourseBlueprint.
 *
 * Mode B: Single-shot synthesis from already-ingested Resource content. The caller
 * provides RAG-retrieved context chunks + a target; the generator assembles a prompt
 * and returns the parsed blueprint.
 */

import { ARCHITECT_SYSTEM_PROMPT } from "../../prompts/architect";
import type { ChatMessage, ChatOptions } from "../../provider";
import type { AIRole } from "../../config";
import type { CourseBlueprint, BlueprintTarget } from "./types";
import { validateBlueprint } from "./validator";

/** Shape of the chat chunk yielded by the router. */
interface ChatChunkLike {
  delta: string;
}

/** Prompt for Mode B synthesis — transforms ingested resource content into a blueprint. */
const MODE_B_SYSTEM_PROMPT = `You are the Campaign Architect — you design structured courses from provided resource content.

## Your task
Transform the provided resource content into a structured Course Blueprint. Do NOT mirror the document structure — resequence into capability milestones through the desirable-difficulties lens.

## Output format
Output exactly one JSON code block:

\`\`\`json
{
  "title": "<course title drawn from resource content>",
  "domain": "<domain name that fits the content>",
  "milestones": [{ "order": 0, "capability": "...", "description": "...", "difficulty": 1 }],
  "cardSeeds": [{ "front": "...", "milestoneIndex": 0 }],
  "retrievalQs": [{ "question": "...", "milestoneIndex": 0, "answerSnippet": "..." }],
  "feynmanTargets": [{ "concept": "...", "milestoneIndex": 0 }],
  "resourceMap": [{ "resourceId": "...", "milestoneIndex": 0, "role": "primary" }]
}
\`\`\`

## Design principles
- **Capability milestones**: Each milestone describes what the learner CAN DO, not what they know.
- **Desirable difficulties**: Sequence for productive struggle — foundational before advanced, but not always linear.
- **3-8 milestones**, 3-10 card seeds per milestone, 2-4 retrieval Qs per milestone, 1-2 Feynman targets per milestone.
- **Resource map**: Link each resource to the milestone(s) it supports.
- **Scaffold only**: Card seeds are fronts only — no pre-written answers.
- **Domain**: Choose or create a domain name that fits the course content.`;

/**
 * Interface for the BlueprintGenerator. Features consume the `useBlueprint()` hook,
 * which wraps an instance of this interface (Convention IV).
 */
export interface BlueprintGenerator {
  /** Mode A: Start a fresh conversation with a target. Clears history. */
  startConversation(target: BlueprintTarget): void;

  /** Mode A: Send a user message, stream AI response tokens. */
  sendMessage(text: string): AsyncIterable<string>;

  /** Get the full conversation transcript (for display). */
  getMessages(): Array<{ role: "user" | "assistant"; content: string }>;

  /** The current target (set via startConversation or synthesize). */
  getTarget(): BlueprintTarget | null;

  /**
   * Try to extract a CourseBlueprint from the conversation (Mode A finalize).
   * Returns null if no valid JSON blueprint is found in the last assistant message.
   */
  extractBlueprint(): CourseBlueprint | null;

  /**
   * Mode B: Single-shot synthesis from RAG context chunks + target.
   * Returns the parsed CourseBlueprint or throws on failure.
   */
  synthesize(target: BlueprintTarget, contextChunks: string[]): Promise<CourseBlueprint>;

  /** Whether the generator is currently streaming a response. */
  isActive: boolean;
}

/** Options for constructing BlueprintGeneratorImpl. */
export interface BlueprintGeneratorOpts {
  router: {
    chat: (role: AIRole, messages: ChatMessage[], opts: ChatOptions) => AsyncIterable<ChatChunkLike>;
  };
}

/** System prompt with the target embedded for Mode A first turn. */
function buildModeAFirstTurn(target: BlueprintTarget): ChatMessage[] {
  let content = ARCHITECT_SYSTEM_PROMPT;
  content += `\n\n## Learner's initial target\n`;
  content += `- Topic: ${target.topic}\n`;
  content += `- Desired depth: ${target.depth}\n`;
  content += `- Scope: ${target.scope}\n`;
  if (target.domainName) content += `- Domain: ${target.domainName}\n`;
  if (target.currentLevel) content += `- Current level: ${target.currentLevel}\n`;
  if (target.timeBudget) content += `- Time budget: ${target.timeBudget}\n`;

  content += `\n## Begin the conversation\n`;
  content += `Greet the learner and start the calibration dialogue. Do NOT emit a blueprint yet — first understand their needs through conversation.`;

  return [
    { role: "system", content },
    { role: "user", content: `I want to design a course on "${target.topic}" at ${target.depth} depth.` },
  ];
}

/** Build the Mode B synthesis prompt from target + context chunks. */
function buildModeBPrompt(target: BlueprintTarget, contextChunks: string[]): ChatMessage[] {
  let systemContent = MODE_B_SYSTEM_PROMPT;
  systemContent += `\n\n## Target specification\n`;
  systemContent += `- Topic: ${target.topic}\n`;
  systemContent += `- Desired depth: ${target.depth}\n`;
  systemContent += `- Scope: ${target.scope}\n`;
  if (target.domainName) systemContent += `- Domain: ${target.domainName}\n`;

  systemContent += `\n## Resource content\n`;
  systemContent += `--- BEGIN RESOURCE CONTENT ---\n`;
  for (let i = 0; i < contextChunks.length; i++) {
    systemContent += `[${i + 1}] ${contextChunks[i]}\n`;
  }
  systemContent += `--- END RESOURCE CONTENT ---\n`;

  systemContent += `\nNow synthesize a Course Blueprint from the resource content above.`;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: `Design a course for "${target.topic}" at ${target.depth} depth using the provided resources.` },
  ];
}

/**
 * Try to extract a JSON code block from AI response text.
 * Looks for the first ```json ... ``` block.
 */
export function extractJsonFromResponse(text: string): Record<string, unknown> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Concrete BlueprintGenerator implementation.
 *
 * Mode A: Manages conversation state internally. Callers stream user messages
 * and read back the transcript. When the AI emits a JSON blueprint, call
 * `extractBlueprint()` to parse it.
 *
 * Mode B: Single-shot synthesis. Callers provide RAG context + target.
 */
export class BlueprintGeneratorImpl implements BlueprintGenerator {
  private _messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  private _target: BlueprintTarget | null = null;
  private _isActive = false;

  constructor(private opts: BlueprintGeneratorOpts) {}

  get isActive(): boolean {
    return this._isActive;
  }

  startConversation(target: BlueprintTarget): void {
    this._target = target;
    this._messages = [];
    this._isActive = false;
    // Note: first AI response is generated when sendMessage is called,
    // matching the FeynmanTutor pattern.
  }

  getMessages(): Array<{ role: "user" | "assistant"; content: string }> {
    return this._messages;
  }

  getTarget(): BlueprintTarget | null {
    return this._target;
  }

  async *sendMessage(text: string): AsyncIterable<string> {
    this._isActive = true;

    // Add the user message
    this._messages.push({ role: "user", content: text });

    // Build the chat messages for the AI
    // First turn: use the full system prompt with target
    // Subsequent turns: use simple continuation
    const chatMessages: ChatMessage[] = this._messages.length === 1
      ? this.buildFirstTurnMessages()
      : this.buildContinuationMessages();

    // Stream AI response
    const assistantMsg: { role: "assistant"; content: string } = { role: "assistant", content: "" };
    this._messages.push(assistantMsg);

    try {
      for await (const chunk of this.opts.router.chat("reasoning", chatMessages, {
        containsVaultContent: true,
      })) {
        const delta = chunk.delta ?? "";
        assistantMsg.content += delta;
        yield delta;
      }
    } catch (e) {
      const errorText = `\n\n_Error: ${e instanceof Error ? e.message : "AI provider unavailable"}_`;
      assistantMsg.content += errorText;
      yield errorText;
    } finally {
      this._isActive = false;
    }
  }

  /**
   * Try to extract a CourseBlueprint from the conversation.
   * Searches the last assistant message for a JSON code block.
   */
  extractBlueprint(): CourseBlueprint | null {
    // Find the last assistant message
    let lastAssistant: string | null = null;
    for (let i = this._messages.length - 1; i >= 0; i--) {
      if (this._messages[i].role === "assistant") {
        lastAssistant = this._messages[i].content;
        break;
      }
    }
    if (!lastAssistant) return null;

    const json = extractJsonFromResponse(lastAssistant);
    if (!json) return null;

    return validateBlueprint(json);
  }

  /**
   * Mode B: Synthesize a blueprint from RAG context chunks + target.
   */
  async synthesize(target: BlueprintTarget, contextChunks: string[]): Promise<CourseBlueprint> {
    this._target = target;
    this._messages = [];
    this._isActive = true;

    const chatMessages = buildModeBPrompt(target, contextChunks);

    let fullText = "";
    try {
      for await (const chunk of this.opts.router.chat("reasoning", chatMessages, {
        containsVaultContent: true,
      })) {
        fullText += chunk.delta ?? "";
      }
    } catch (e) {
      this._isActive = false;
      throw new Error(
        `Blueprint synthesis failed: ${e instanceof Error ? e.message : "AI provider unavailable"}`,
      );
    }

    this._isActive = false;

    // Store the response as an assistant message
    this._messages.push({ role: "assistant", content: fullText });

    // Extract blueprint
    const json = extractJsonFromResponse(fullText);
    if (!json) {
      // Try to parse the entire response as JSON (no code block)
      try {
        const parsed = JSON.parse(fullText.trim());
        if (typeof parsed === "object" && parsed !== null) {
          return validateBlueprint(parsed as Record<string, unknown>);
        }
      } catch {
        // fall through
      }
      throw new Error("Blueprint synthesis returned no parseable blueprint");
    }

    return validateBlueprint(json);
  }

  /** Build messages for the first turn — includes the full system prompt with target. */
  private buildFirstTurnMessages(): ChatMessage[] {
    const target = this._target;
    if (!target) throw new Error("No target set. Call startConversation first.");

    return buildModeAFirstTurn(target);
  }

  /** Build messages for subsequent turns — system + full history as a single prompt. */
  private buildContinuationMessages(): ChatMessage[] {
    // Build from stored messages, converting to ChatMessage format
    const systemMsg: ChatMessage = {
      role: "system",
      content: `${ARCHITECT_SYSTEM_PROMPT}\n\nContinue the conversation. Do NOT emit the blueprint until the learner agrees.`,
    };

    const history: ChatMessage[] = this._messages.map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
    }));

    return [systemMsg, ...history];
  }
}
