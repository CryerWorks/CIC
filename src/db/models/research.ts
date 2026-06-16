import { z } from "zod";

export const RESEARCH_SOURCE_TYPES = [
  "syllabus",
  "courseware",
  "textbook",
  "video",
  "article",
  "other",
] as const;

export type ResearchSourceType = (typeof RESEARCH_SOURCE_TYPES)[number];

export const ResearchSourceSchema = z.object({
  id: z.string(),
  vault_id: z.string(),
  url: z.string(),
  title: z.string(),
  source_type: z.enum(RESEARCH_SOURCE_TYPES),
  quality_score: z.number().nullable(),
  ingested_as_resource_id: z.string().nullable(),
  fetched_at: z.string(),
});

export type ResearchSourceRow = z.infer<typeof ResearchSourceSchema>;

export const DECLARED_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type DeclaredLevel = (typeof DECLARED_LEVELS)[number];

export const DEPTH_GOALS = ["overview", "working", "mastery"] as const;
export type DepthGoal = (typeof DEPTH_GOALS)[number];

export const LearningProfileSchema = z.object({
  id: z.string(),
  vault_id: z.string(),
  domain: z.string(),
  declared_level: z.enum(DECLARED_LEVELS),
  knowledge_text: z.string(),
  time_budget: z.string(),
  depth_goal: z.enum(DEPTH_GOALS),
  created_at: z.string(),
});

export type LearningProfileRow = z.infer<typeof LearningProfileSchema>;
