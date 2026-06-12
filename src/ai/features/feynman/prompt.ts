import { SOCRATIC_SYSTEM_PROMPT } from "../../prompts/socratic";
import type { FeynmanMessage } from "./types";

const MAX_MESSAGE_PAIRS = 20;

interface PromptInput {
  messages: FeynmanMessage[];
  contextChunks: string[];
  learnerText: string;
}

/**
 * Build the full message array for router.chat('reasoning', …).
 *
 * System prompt + RAG context + truncated conversation history.
 * Pure function — no side effects, no I/O.
 */
export function buildSocraticPrompt(input: PromptInput) {
  const { messages, contextChunks, learnerText } = input;

  // Build the system message with injected RAG context
  let systemContent = SOCRATIC_SYSTEM_PROMPT;

  if (contextChunks.length > 0) {
    systemContent += `\n\nPROVIDED CONTEXT (from the learner's own materials):\n`;
    systemContent += `--- BEGIN CONTEXT ---\n`;
    for (let i = 0; i < contextChunks.length; i++) {
      systemContent += `[${i + 1}] ${contextChunks[i]}\n`;
    }
    systemContent += `--- END CONTEXT ---\n`;
  } else {
    systemContent += `\n\n(No grounding context available — rely on general knowledge with uncertainty flags.)\n`;
  }

  // Truncate conversation history to MAX_MESSAGE_PAIRS
  const recent = messages.slice(-MAX_MESSAGE_PAIRS * 2);

  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent },
  ];

  for (const msg of recent) {
    chatMessages.push({
      role: msg.role === "learner" ? "user" : "assistant",
      content: msg.content,
    });
  }

  // Add the new learner message
  chatMessages.push({ role: "user", content: learnerText });

  return chatMessages;
}
