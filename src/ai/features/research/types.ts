/**
 * Types for the AI Research Agent (Feature 022 / F11).
 *
 * Defines the data model for the research pipeline:
 * goal → search → fetch → evaluate → profile → blueprint → campaign.
 */

import type { CourseBlueprint } from "../blueprint/types";

/** The type of a web search result. */
export type ResearchSourceType =
  | "syllabus"
  | "courseware"
  | "textbook"
  | "video"
  | "article"
  | "other";

/** A single web search result from a provider. */
export interface WebSearchResult {
  /** Result page title. */
  title: string;
  /** Result page URL. */
  url: string;
  /** Result page snippet / description. */
  snippet: string;
  /** Classified type of source. */
  sourceType: ResearchSourceType;
}

/**
 * Interface for web search providers.
 * Implementations: SearXNGAdapter (self-hosted), ManualAdapter (user-provided URLs).
 */
export interface WebSearchProvider {
  /**
   * Search the web for learning materials on a query.
   * @param query - The search query (topic to research).
   * @param count - Maximum number of results to return (default 10).
   */
  search(query: string, count?: number): Promise<WebSearchResult[]>;
}

/** A research source that has been discovered and optionally fetched. */
export interface ResearchSource {
  /** Source URL. */
  url: string;
  /** Source page title. */
  title: string;
  /** Classified type. */
  sourceType: ResearchSourceType;
  /** AI-evaluated quality score (0-1). */
  qualityScore?: number;
  /** Fetched + converted content (Markdown), if available. */
  content?: string;
}

/** User's learning profile for a domain. */
export interface LearningProfile {
  /** Domain name being studied. */
  domain: string;
  /** Self-declared skill level. */
  declaredLevel: "beginner" | "intermediate" | "advanced";
  /** Freeform description of current knowledge. */
  knowledgeText: string;
  /** Time budget description (e.g. "5 hours/week for 2 months"). */
  timeBudget: string;
  /** Desired depth goal. */
  depthGoal: "overview" | "working" | "mastery";
}

/** The user's research goal — what they want to learn. */
export interface ResearchGoal {
  /** Topic or subject to research. */
  topic: string;
  /** Optional elaboration on what they want to learn. */
  description?: string;
  /** Optional pre-existing learning profile. */
  learningProfile?: LearningProfile;
}

/** A generated course within a research result. */
export interface ResearchCourse {
  /** Course title. */
  title: string;
  /** Domain name. */
  domain: string;
  /** Generated CourseBlueprint. */
  courseBlueprint: CourseBlueprint;
}

/** The final assembled result of a research execution. */
export interface ResearchResult {
  /** The original research goal. */
  goal: ResearchGoal;
  /** Discovered and evaluated sources. */
  sources: ResearchSource[];
  /** Generated courses for the campaign. */
  courses: ResearchCourse[];
  /** Optional campaign title (derived from the research topic). */
  campaignTitle?: string;
}

/** Phase labels for the research pipeline — used by the UI progress indicator. */
export type ResearchPhase =
  | "idle"
  | "searching"
  | "fetching"
  | "evaluating"
  | "profiling"
  | "blueprinting"
  | "assembling"
  | "done"
  | "error";

/** A progress event yielded by the ResearchEngine during execution. */
export interface ResearchEvent {
  /** Current phase of the pipeline. */
  phase: ResearchPhase;
  /** Human-readable description of what's happening. */
  message: string;
  /** Progress value (0-1) within the current phase. */
  progress?: number;
  /** Error message, if phase is "error". */
  error?: string;
}

export interface ResearchEngine {
  /**
   * Execute the full research pipeline for a given goal.
   * Yields progress events throughout the process.
   */
  execute(goal: ResearchGoal): AsyncIterable<ResearchEvent>;
  /** Get the final result after execution completes. */
  getResult(): ResearchResult | null;
}
