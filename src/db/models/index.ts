/** All entity models + enums. `_shared.ts` stays internal (read-path zod building blocks). */
export * from "./enums";
export * from "./vault";
export * from "./domain";
export * from "./campaign";
export * from "./course";
export * from "./milestone";
export * from "./project";
export * from "./session";
export * from "./sessionCardDraft";
export * from "./card";
export * from "./review";
export * from "./streak";
export * from "./pretestResponse";
export * from "./resource";
export * from "./links";
export * from "./vaultWrite";
export * from "./setting";

// Feature 023: Session Sources (Daily Loop enrichment)
export { SessionSourceSchema } from "./sessionSource";
export type { SessionSourceRow } from "./sessionSource";

// Feature 022: Research Agent (F11)
export {
  ResearchSourceSchema,
  LearningProfileSchema,
  RESEARCH_SOURCE_TYPES,
  DECLARED_LEVELS,
  DEPTH_GOALS,
} from "./research";
export type {
  ResearchSourceRow,
  ResearchSourceType,
  DeclaredLevel,
  DepthGoal,
  LearningProfileRow,
} from "./research";
