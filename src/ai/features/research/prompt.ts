/**
 * Prompt builder for the Research Agent pipeline.
 * Assembles system + user messages from a research goal, learning profile, and sources.
 */

import { RESEARCH_SYSTEM_PROMPT } from "../../prompts/research";
import type { ChatMessage } from "../../provider";
import type { ResearchGoal, ResearchSource } from "./types";

/**
 * Build the system + user messages for the Research Architect AI call.
 * The AI receives the research goal, learning profile, and discovered sources
 * and returns structured Course Blueprints.
 */
export function buildResearchPrompt(
  goal: ResearchGoal,
  sources: ResearchSource[],
): ChatMessage[] {
  let systemContent = RESEARCH_SYSTEM_PROMPT;

  // Attach learning profile context
  if (goal.learningProfile) {
    systemContent += `\n\n## Learner's profile\n`;
    systemContent += `- Domain: ${goal.learningProfile.domain}\n`;
    systemContent += `- Declared level: ${goal.learningProfile.declaredLevel}\n`;
    systemContent += `- Current knowledge: ${goal.learningProfile.knowledgeText}\n`;
    systemContent += `- Time budget: ${goal.learningProfile.timeBudget}\n`;
    systemContent += `- Depth goal: ${goal.learningProfile.depthGoal}\n`;
  }

  // Attach discovered sources
  if (sources.length > 0) {
    systemContent += `\n## Discovered sources\n`;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      systemContent += `[${i + 1}] ${s.title} (${s.url})\n`;
      systemContent += `    Type: ${s.sourceType}\n`;
      if (s.qualityScore !== undefined) {
        systemContent += `    Quality: ${s.qualityScore.toFixed(2)}\n`;
      }
      if (s.content) {
        systemContent += `    Content preview: ${s.content.substring(0, 500)}...\n`;
      }
    }
  }

  const userContent = `Research goal: "${goal.topic}"${
    goal.description ? `\nDescription: ${goal.description}` : ""
  }\n\nBased on the profile and sources above, design a structured learning campaign.`;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ] satisfies ChatMessage[];
}

/**
 * Extract a JSON campaign result from AI response text.
 * Looks for the first \`\`\`json ... \`\`\` block.
 */
export function extractCampaignJson(
  text: string,
): { campaignTitle?: string; courses: unknown[] } | null {
  // 1. Try ```json fence
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (isValidResult(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  // 2. Try any triple-backtick block (some models use ``` without json tag)
  const anyFenceMatch = text.match(/```\s*([\s\S]*?)```/);
  if (anyFenceMatch) {
    try {
      const parsed = JSON.parse(anyFenceMatch[1].trim());
      if (isValidResult(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  // 3. Try to find a top-level JSON object anywhere in the text
  const jsonObjMatch = text.match(/\{[\s\S]*"courses"\s*:\s*\[[\s\S]*?\}\s*\}/);
  if (jsonObjMatch) {
    try {
      const parsed = JSON.parse(jsonObjMatch[0]);
      if (isValidResult(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  // 4. Try parsing the entire text as JSON (some models return pure JSON)
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("```json")) {
      const cleaned = trimmed
        .replace(/^```json\s*/, "")
        .replace(/```\s*$/, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (isValidResult(parsed)) return parsed;
    }
  } catch { /* fall through */ }

  return null;
}

function isValidResult(
  parsed: unknown,
): parsed is { campaignTitle?: string; courses: unknown[] } {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>).courses)
  );
}
