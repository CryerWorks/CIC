/**
 * ResearchEngine — the orchestrator for the AI Research Agent pipeline.
 *
 * Pipeline:
 *   1. search   → discover web sources for the research topic
 *   2. fetch    → (v1: stub — returns URLs only; v1.1: full content extraction)
 *   3. evaluate → AI evaluates source quality and relevance
 *   4. profile  → incorporate learning profile (user-provided or from DB)
 *   5. blueprint→ AI generates Course Blueprints from sources + profile
 *   6. assemble → package everything into a ResearchResult
 *
 * Each step yields progress events for the UI.
 */

import type { ChatMessage, ChatOptions } from "../../provider";
import type { AIRole } from "../../config";
import type {
  ResearchEngine,
  ResearchGoal,
  ResearchEvent,
  ResearchResult,
  ResearchSource,
  ResearchCourse,
  WebSearchProvider,
} from "./types";
import { buildResearchPrompt, extractCampaignJson } from "./prompt";
import { validateBlueprint } from "../blueprint/validator";

/** Shape of the chat chunk yielded by the router. */
interface ChatChunkLike {
  delta: string;
}

/** Dependencies required by the ResearchEngine. */
export interface ResearchEngineDeps {
  /** AI router for LLM calls. */
  router: {
    chat: (role: AIRole, messages: ChatMessage[], opts: ChatOptions) => AsyncIterable<ChatChunkLike>;
  };
  /** Web search provider (SearXNG or Manual). */
  searchProvider: WebSearchProvider;
  /** Current vault ID for scoping. */
  vaultId: string;
}

/**
 * Concrete ResearchEngine implementation.
 * Walks through the full research pipeline, yielding progress events.
 */
export class ResearchEngineImpl implements ResearchEngine {
  private _result: ResearchResult | null = null;

  constructor(private readonly deps: ResearchEngineDeps) {}

  getResult(): ResearchResult | null {
    return this._result;
  }

  async *execute(goal: ResearchGoal): AsyncIterable<ResearchEvent> {
    // ── Validation ──
    if (!goal.topic.trim()) {
      yield { phase: "error", message: "Research topic cannot be empty", error: "Empty topic" };
      return;
    }

    // ── Step 1: Search ──
    yield { phase: "searching", message: `Searching for materials on "${goal.topic}"…`, progress: 0 };

    const searchResults = await this.deps.searchProvider.search(goal.topic, 15);
    if (searchResults.length === 0) {
      yield {
        phase: "searching",
        message: "No results found. Try a different topic or add URLs manually.",
        progress: 1,
      };
      // Continue with empty sources — the AI can still work with the profile
    }

    // Convert to ResearchSource[]
    const sources: ResearchSource[] = searchResults.map((r) => ({
      url: r.url,
      title: r.title,
      sourceType: r.sourceType,
    }));

    yield {
      phase: "searching",
      message: `Found ${sources.length} potential sources`,
      progress: 1,
    };

    // ── Step 2: Fetch (v1: stub — just yield the URLs) ──
    yield { phase: "fetching", message: `${sources.length} sources identified (URLs only in v1 — full content extraction coming in v1.1)`, progress: 1 };

    // ── Step 3: Evaluate (delegated to AI in the blueprint step) ──
    yield { phase: "evaluating", message: "Evaluating source relevance and quality…", progress: 0.5 };

    // ── Step 4: Profile ──
    yield {
      phase: "profiling",
      message: goal.learningProfile
        ? `Using learning profile: ${goal.learningProfile.declaredLevel} level in ${goal.learningProfile.domain}`
        : "No learning profile provided — using default calibration",
      progress: 1,
    };

    // ── Step 5: Blueprint → AI generates courses ──
    yield {
      phase: "blueprinting",
      message: `Generating course blueprints from ${sources.length} sources…`,
      progress: 0,
    };

    const chatMessages = buildResearchPrompt(goal, sources);

    let fullResponse = "";
    let failedValidation: string | undefined;
    try {
      for await (const chunk of this.deps.router.chat("reasoning", chatMessages, {
        containsVaultContent: true,
      })) {
        fullResponse += chunk.delta ?? "";
      }
    } catch (e) {
      yield {
        phase: "error",
        message: "AI generation failed",
        error: e instanceof Error ? e.message : "Unknown AI error",
      };
      return;
    }

    yield { phase: "blueprinting", message: "AI response received, parsing course blueprints…", progress: 1 };

    // Parse the AI response
    const campaignData = extractCampaignJson(fullResponse);

    const courses: ResearchCourse[] = [];
    if (campaignData && Array.isArray(campaignData.courses)) {
      for (const rawCourse of campaignData.courses) {
        try {
          const bp = validateBlueprint(rawCourse as Record<string, unknown>);
          courses.push({
            title: bp.title,
            domain: bp.domain,
            courseBlueprint: bp,
          });
        } catch (e) {
          // Log validation failures for debugging
          if (courses.length === 0) {
            failedValidation = e instanceof Error ? e.message : String(e);
          }
          continue;
        }
      }
    }

    if (courses.length === 0) {
      const preview = fullResponse.slice(0, 400);
      const detail = failedValidation ? ` Validation: ${failedValidation}.` : "";
      yield {
        phase: "error",
        message: "Could not generate valid course blueprints. Try refining your topic.",
        error: `No valid blueprints.${detail} AI response: "${preview}${fullResponse.length > 400 ? "…" : ""}"`,
      };
      return;
    }

    // ── Step 6: Assemble ──
    yield {
      phase: "assembling",
      message: `Assembling campaign with ${courses.length} course(s)…`,
      progress: 1,
    };

    this._result = {
      goal,
      sources,
      courses,
      campaignTitle: campaignData?.campaignTitle ?? `Learning ${goal.topic}`,
    };

    yield {
      phase: "done",
      message: `Research complete — ${courses.length} course(s) ready for review`,
      progress: 1,
    };
  }
}
