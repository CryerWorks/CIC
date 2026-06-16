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
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>).courses)
    ) {
      return parsed as { campaignTitle?: string; courses: unknown[] };
    }
    return null;
  } catch {
    return null;
  }
}
