/**
 * Zod schemas + validation for the CourseBlueprint IR.
 *
 * Provides runtime validation for blueprint data coming from AI output,
 * user edits, or serialization. The validate function returns a
 * CourseBlueprint on success or throws with a descriptive error.
 */

import { z } from "zod";
import type { CourseBlueprint } from "./types";

// ────────────────────────── Zod schemas ──────────────────────────

const BlueprintDepthSchema = z.enum(["overview", "working", "mastery"]);
const BlueprintScopeSchema = z.enum(["course"]);

const BlueprintTargetSchema = z.object({
  topic: z.string().min(1, "Topic is required").max(200),
  scope: BlueprintScopeSchema,
  depth: BlueprintDepthSchema,
  domainName: z.string().max(100).optional(),
  currentLevel: z.string().max(500).optional(),
  timeBudget: z.string().max(200).optional(),
  resourceIds: z.array(z.string()).optional(),
});

const SessionSourceSchema = z.object({
  url: z.string().min(1, "Source URL is required").max(2000),
  title: z.string().min(1, "Source title is required").max(300),
  type: z.enum(["reading", "watching"]),
  estimatedMinutes: z.number().int().min(1).max(9999).default(30),
});

const SessionCardSeedSchema = z.object({
  front: z.string().min(1, "Card front is required").max(500),
  back: z.string().min(1, "Card answer is required").max(500),
  sourceIndex: z.number().int().min(0),
});

const SessionSeedSchema = z.object({
  title: z.string().min(1, "Session title is required").max(200),
  objective: z.string().min(1, "Session objective is required").max(500),
  sources: z.array(SessionSourceSchema).max(50).default([]),
  cards: z.array(SessionCardSeedSchema).max(100).default([]),
});

const ProjectSeedSchema = z.object({
  title: z.string().min(1, "Project title is required").max(200),
  description: z.string().min(1).max(1000),
  requiredSessionIndices: z.array(z.number().int().min(0)).max(20).default([]),
});

const MilestoneSeedSchema = z.object({
  order: z.number().int().min(0),
  capability: z.string().min(1, "Milestone capability is required").max(300),
  description: z.string().min(1).max(500),
  difficulty: z.number().int().min(1).max(5),
  sessions: z.array(SessionSeedSchema).max(20).optional().default([]),
  projects: z.array(ProjectSeedSchema).max(10).optional().default([]),
});

const CardSeedSchema = z.object({
  front: z.string().min(1, "Card front is required").max(500),
  back: z.string().min(1, "Card answer is required").max(500),
  milestoneIndex: z.number().int().min(0),
});

const RetrievalQSchema = z.object({
  question: z.string().min(1, "Question is required").max(500),
  milestoneIndex: z.number().int().min(0),
  answerSnippet: z.string().min(1).max(300),
});

const FeynmanTargetSchema = z.object({
  concept: z.string().min(1, "Concept is required").max(200),
  milestoneIndex: z.number().int().min(0),
});

const BlueprintResourceMapSchema = z.object({
  resourceId: z.string().min(1),
  milestoneIndex: z.number().int().min(0),
  role: z.enum(["primary", "secondary", "reference"]).optional(),
});

const CourseBlueprintSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  domain: z.string().min(1, "Domain is required").max(100),
  target: BlueprintTargetSchema.optional().default({
    topic: "",
    scope: "course" as const,
    depth: "working" as const,
  }),
  milestones: z.array(MilestoneSeedSchema).min(1, "At least one milestone is required").max(20),
  cardSeeds: z.array(CardSeedSchema).max(200),
  retrievalQs: z.array(RetrievalQSchema).max(100),
  feynmanTargets: z.array(FeynmanTargetSchema).max(50),
  resourceMap: z.array(BlueprintResourceMapSchema).max(50),
});

// ────────────────────────── Validation ──────────────────────────

/**
 * Validate an unknown input as a CourseBlueprint.
 * Throws a `BlueprintValidationError` with a user-readable message on failure.
 * Returns the validated blueprint on success.
 */
export function validateBlueprint(input: unknown): CourseBlueprint {
  const result = CourseBlueprintSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues;
    const firstIssue = issues[0];
    throw new BlueprintValidationError(
      `Blueprint validation failed: ${firstIssue?.message ?? "Unknown error"}` +
        (issues.length > 1 ? ` (and ${issues.length - 1} more issue(s))` : ""),
    );
  }

  // Post-schema validation: verify milestone indices are in range
  const blueprint = result.data;
  const milestoneCount = blueprint.milestones.length;

  for (const card of blueprint.cardSeeds) {
    if (card.milestoneIndex >= milestoneCount) {
      throw new BlueprintValidationError(
        `Card "${card.front.substring(0, 50)}" references milestone index ${card.milestoneIndex}, but only ${milestoneCount} milestone(s) exist`,
      );
    }
  }

  for (const q of blueprint.retrievalQs) {
    if (q.milestoneIndex >= milestoneCount) {
      throw new BlueprintValidationError(
        `Retrieval question references milestone index ${q.milestoneIndex}, but only ${milestoneCount} milestone(s) exist`,
      );
    }
  }

  for (const ft of blueprint.feynmanTargets) {
    if (ft.milestoneIndex >= milestoneCount) {
      throw new BlueprintValidationError(
        `Feynman target "${ft.concept}" references milestone index ${ft.milestoneIndex}, but only ${milestoneCount} milestone(s) exist`,
      );
    }
  }

  // Post-schema validation: verify session card source indices are in range
  for (let mi = 0; mi < milestoneCount; mi++) {
    const ms = blueprint.milestones[mi];
    if (!ms.sessions || ms.sessions.length === 0) continue;

    for (let si = 0; si < ms.sessions.length; si++) {
      const session = ms.sessions[si];
      const sourceCount = session.sources.length;
      for (const sc of session.cards) {
        if (sc.sourceIndex >= sourceCount) {
          throw new BlueprintValidationError(
            `Session card "${sc.front.substring(0, 50)}" references source index ${sc.sourceIndex} in session "${session.title}", but only ${sourceCount} source(s) exist in that session`,
          );
        }
      }
    }

    // Verify project requiredSessionIndices are in range
    if (!ms.projects) continue;
    for (const proj of ms.projects) {
      for (const rsi of proj.requiredSessionIndices) {
        if (rsi >= ms.sessions.length) {
          throw new BlueprintValidationError(
            `Project "${proj.title}" references session index ${rsi}, but only ${ms.sessions.length} session(s) exist in milestone ${mi}`,
          );
        }
      }
    }
  }

  return blueprint;
}

/**
 * Validates a partial blueprint (for user edits in the review UI).
 * Returns the validated partial, or throws on unrecoverable errors.
 * Allows missing fields — only validates what's present.
 */
export function validatePartialBlueprint(
  input: Partial<Record<string, unknown>>,
): Partial<CourseBlueprint> {
  // Partial validation is permissive; we only check types of present fields
  const partial: Partial<CourseBlueprint> = {};

  if (input.title !== undefined) {
    const r = z.string().min(1).max(200).safeParse(input.title);
    if (r.success) partial.title = r.data;
  }
  if (input.domain !== undefined) {
    const r = z.string().min(1).max(100).safeParse(input.domain);
    if (r.success) partial.domain = r.data;
  }
  if (input.milestones !== undefined) {
    const r = z.array(MilestoneSeedSchema).safeParse(input.milestones);
    if (r.success) partial.milestones = r.data;
  }
  if (input.cardSeeds !== undefined) {
    const r = z.array(CardSeedSchema).safeParse(input.cardSeeds);
    if (r.success) partial.cardSeeds = r.data;
  }
  if (input.retrievalQs !== undefined) {
    const r = z.array(RetrievalQSchema).safeParse(input.retrievalQs);
    if (r.success) partial.retrievalQs = r.data;
  }
  if (input.feynmanTargets !== undefined) {
    const r = z.array(FeynmanTargetSchema).safeParse(input.feynmanTargets);
    if (r.success) partial.feynmanTargets = r.data;
  }
  if (input.resourceMap !== undefined) {
    const r = z.array(BlueprintResourceMapSchema).safeParse(input.resourceMap);
    if (r.success) partial.resourceMap = r.data;
  }
  if (input.target !== undefined) {
    const r = BlueprintTargetSchema.safeParse(input.target);
    if (r.success) partial.target = r.data;
  }

  // Sessions and projects are validated as part of milestones — no separate partial field needed

  return partial;
}

// ────────────────────────── Errors ──────────────────────────

export class BlueprintValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlueprintValidationError";
  }
}
