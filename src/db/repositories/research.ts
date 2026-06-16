import { insert, selectParsed } from "./query";
import type { SqlExecutor } from "../executor";
import {
  ResearchSourceSchema,
  LearningProfileSchema,
  type ResearchSourceRow,
  type LearningProfileRow,
  type ResearchSourceType,
  type DeclaredLevel,
  type DepthGoal,
} from "../models/research";

// ── Research Sources ──

export interface CreateResearchSourceInput {
  vaultId: string;
  url: string;
  title?: string;
  sourceType?: ResearchSourceType;
  qualityScore?: number | null;
  ingestedAsResourceId?: string | null;
}

export async function createResearchSource(
  db: SqlExecutor,
  input: CreateResearchSourceInput,
): Promise<ResearchSourceRow> {
  const row: ResearchSourceRow = {
    id: crypto.randomUUID(),
    vault_id: input.vaultId,
    url: input.url,
    title: input.title ?? "",
    source_type: input.sourceType ?? "other",
    quality_score: input.qualityScore ?? null,
    ingested_as_resource_id: input.ingestedAsResourceId ?? null,
    fetched_at: new Date().toISOString(),
  };
  await insert(db, "research_sources", row);
  return ResearchSourceSchema.parse(row);
}

export async function getResearchSource(
  db: SqlExecutor,
  id: string,
): Promise<ResearchSourceRow | null> {
  const rows = await selectParsed(
    db,
    ResearchSourceSchema,
    "SELECT * FROM research_sources WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function getResearchSourcesByVault(
  db: SqlExecutor,
  vaultId: string,
): Promise<ResearchSourceRow[]> {
  return selectParsed(
    db,
    ResearchSourceSchema,
    "SELECT * FROM research_sources WHERE vault_id = ? ORDER BY fetched_at DESC",
    [vaultId],
  );
}

export async function updateResearchSourceQuality(
  db: SqlExecutor,
  id: string,
  qualityScore: number,
  ingestedAsResourceId?: string,
): Promise<void> {
  const { update } = await import("./query");
  await update(
    db,
    "research_sources",
    {
      quality_score: qualityScore,
      ...(ingestedAsResourceId !== undefined
        ? { ingested_as_resource_id: ingestedAsResourceId }
        : {}),
    },
    { id },
  );
}

// ── Learning Profiles ──

export interface CreateLearningProfileInput {
  vaultId: string;
  domain: string;
  declaredLevel: DeclaredLevel;
  knowledgeText: string;
  timeBudget: string;
  depthGoal: DepthGoal;
}

export async function saveLearningProfile(
  db: SqlExecutor,
  input: CreateLearningProfileInput,
): Promise<LearningProfileRow> {
  const row: LearningProfileRow = {
    id: crypto.randomUUID(),
    vault_id: input.vaultId,
    domain: input.domain,
    declared_level: input.declaredLevel,
    knowledge_text: input.knowledgeText,
    time_budget: input.timeBudget,
    depth_goal: input.depthGoal,
    created_at: new Date().toISOString(),
  };
  await insert(db, "learning_profiles", row);
  return LearningProfileSchema.parse(row);
}

export async function getLearningProfilesByVault(
  db: SqlExecutor,
  vaultId: string,
): Promise<LearningProfileRow[]> {
  return selectParsed(
    db,
    LearningProfileSchema,
    "SELECT * FROM learning_profiles WHERE vault_id = ? ORDER BY created_at DESC",
    [vaultId],
  );
}

export async function getLatestLearningProfileByVault(
  db: SqlExecutor,
  vaultId: string,
): Promise<LearningProfileRow | null> {
  const rows = await selectParsed(
    db,
    LearningProfileSchema,
    "SELECT * FROM learning_profiles WHERE vault_id = ? ORDER BY created_at DESC LIMIT 1",
    [vaultId],
  );
  return rows[0] ?? null;
}
