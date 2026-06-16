/**
 * AIConfig — the persisted document (Feature 016 / Constitution II / PRD §10). The single JSON
 * blob in the existing `settings` table that captures every AI provider configuration, role
 * routing, and the global lockdown toggle. Validated by zod on every load AND every save (defense
 * in depth — never trust raw shape, per Constitution V).
 *
 * Spine file. Full contract:
 * [specs/016-ai-provider-layer/contracts/config.md](../../specs/016-ai-provider-layer/contracts/config.md).
 * Persistence backing: SQLite `settings(key='ai.config', value=<JSON>)` (m0002, no migration).
 */

import { z } from "zod";
import type { SqlExecutor } from "../db/executor";
import { getSetting, setSetting } from "../db/repositories/settings";

/** The single settings key under which the AIConfig blob is stored. */
export const AI_CONFIG_KEY = "ai.config";

export type ProviderType = "ollama" | "openai-compatible" | "anthropic" | "deepseek" | "gemini" | "voyage";

export type AIRole = "reasoning" | "drafting" | "embeddings";

const AI_ROLES = ["reasoning", "drafting", "embeddings"] as const;

const idSchema = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lowercase kebab-case");
const modelSchema = z.string().min(1).max(120);
const labelSchema = z.string().min(1).max(80).transform((s) => s.trim());

const ProviderConfigBase = z.object({
  id: idSchema,
  type: z.enum(["ollama", "openai-compatible", "anthropic", "deepseek", "gemini", "voyage"]),
  label: labelSchema,
  baseUrl: z.string().url().optional(),
  apiKeyRef: z.string().min(1).max(64).optional(),
  /** Inline API key — primary storage for providers where keychain is unreliable.
   *  When present, adapters use this instead of querying the keychain. */
  apiKey: z.string().min(1).optional(),
  defaultModel: modelSchema.optional(),
  embedModel: modelSchema.optional(),
});

export const ProviderConfigSchema = ProviderConfigBase.refine(
  (p) => {
    // Per-type field requirements. openai-compatible: baseUrl required; apiKeyRef is OPTIONAL
    // because keyless local servers (LM Studio, llama.cpp `--server`, vLLM) are a first-class
    // use case — only fully-managed remote vendors (OpenAI, OpenRouter, Anthropic) require a key.
    if (p.type === "ollama") return !!p.baseUrl;
      if (p.type === "openai-compatible") return !!p.baseUrl;
      if (p.type === "anthropic") return !!(p.apiKeyRef || p.apiKey);
      if (p.type === "deepseek") return !!(p.apiKeyRef || p.apiKey);
      if (p.type === "gemini") return !!(p.apiKeyRef || p.apiKey);
      if (p.type === "voyage") return !!(p.apiKeyRef || p.apiKey);
      return false;
  },
  { message: "missing required fields for this provider type (baseUrl and/or apiKeyRef)" },
).refine(
  (p) => p.apiKeyRef === undefined || p.apiKeyRef === p.id,
  { message: "apiKeyRef must equal id in v1 (no separate ref namespace)" },
);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/** Linked-list fallback chain. */
export interface RoleTarget {
  providerId: string;
  model: string;
  fallback?: RoleTarget;
}

/** zod schema for `RoleTarget`. Recursive via `z.lazy`. Cycle-detection happens at the AIConfig
 *  level (where we know the set of provider ids) — a chain of length N is allowed; visiting the
 *  same providerId twice in a single chain is rejected. */
export const RoleTargetSchema: z.ZodType<RoleTarget> = z.lazy(() =>
  z.object({
    providerId: idSchema,
    model: modelSchema,
    fallback: z.optional(RoleTargetSchema),
  }),
);

/** Walks a fallback chain and returns the ordered list of provider ids at each step. */
function chainProviderIds(t: RoleTarget): string[] {
  const out: string[] = [];
  let cur: RoleTarget | undefined = t;
  while (cur) {
    out.push(cur.providerId);
    cur = cur.fallback;
  }
  return out;
}

const RoutingSchema = z.object({
  reasoning: RoleTargetSchema.nullable(),
  drafting: RoleTargetSchema.nullable(),
  embeddings: RoleTargetSchema.nullable(),
});

export const AIConfigSchema = z
  .object({
    providers: z.array(ProviderConfigSchema),
    routing: RoutingSchema,
    lockdown: z.boolean(),
    version: z.number().int().nonnegative(),
  })
  .superRefine((cfg, ctx) => {
    // Provider id uniqueness.
    const ids = new Set<string>();
    for (const p of cfg.providers) {
      if (ids.has(p.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["providers"],
          message: `duplicate provider id: ${p.id}`,
        });
        return;
      }
      ids.add(p.id);
    }

    // Referential integrity + cycle detection at every fallback depth.
    for (const role of AI_ROLES) {
      const target = cfg.routing[role];
      if (target === null) continue;
      const visited = new Set<string>();
      let cur: RoleTarget | undefined = target;
      while (cur) {
        if (!ids.has(cur.providerId)) {
          ctx.addIssue({
            code: "custom",
            path: ["routing", role, "providerId"],
            message: `routing.${role} references unknown provider: ${cur.providerId}`,
          });
          return;
        }
        if (visited.has(cur.providerId)) {
          ctx.addIssue({
            code: "custom",
            path: ["routing", role],
            message: `cyclic fallback chain at routing.${role}: ${chainProviderIds(target).join(" → ")}`,
          });
          return;
        }
        visited.add(cur.providerId);
        cur = cur.fallback;
      }
    }
  });

export type AIConfig = z.infer<typeof AIConfigSchema>;

/** A fresh, empty configuration: no providers, all roles `null`, lockdown OFF, version 0. */
export function emptyAIConfig(): AIConfig {
  return {
    providers: [],
    routing: { reasoning: null, drafting: null, embeddings: null },
    lockdown: false,
    version: 0,
  };
}

/** A structural shape over zod issues that doesn't depend on whether `z.ZodIssue` /
 *  `z.core.$ZodIssue` is a publicly exported type alias in the installed zod version. */
export interface AIConfigIssue {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
  readonly code: string;
}

export class AIConfigError extends Error {
  readonly issues: ReadonlyArray<AIConfigIssue>;
  constructor(issues: ReadonlyArray<AIConfigIssue>, message?: string) {
    super(message ?? "AI configuration is invalid");
    this.name = "AIConfigError";
    this.issues = issues;
  }
}

/**
 * Loads the AIConfig from the SQLite settings table. Returns `emptyAIConfig()` when no row exists
 * (fresh install). Throws `AIConfigError` when the stored value is malformed JSON or fails zod
 * validation — the caller (settings UI) catches it and offers a reset (FR-003).
 */
export async function loadAIConfig(db: SqlExecutor): Promise<AIConfig> {
  const raw = await getSetting(db, AI_CONFIG_KEY);
  if (raw === null) return emptyAIConfig();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AIConfigError(
      [{ code: "custom", path: [], message: `corrupt JSON in settings.${AI_CONFIG_KEY}` }],
      "AI configuration is corrupt JSON",
    );
  }
  const result = AIConfigSchema.safeParse(parsed);
  if (!result.success) throw new AIConfigError(result.error.issues as ReadonlyArray<AIConfigIssue>);
  return result.data;
}

/**
 * Validates and persists the AIConfig. Bumps `version` by 1 on success (downstream consumers
 * detect changes via the version counter — research R8). Throws `AIConfigError` on validation
 * failure; the on-disk state is NOT touched in that case.
 */
export async function saveAIConfig(db: SqlExecutor, config: AIConfig): Promise<AIConfig> {
  const next: AIConfig = { ...config, version: config.version + 1 };
  const result = AIConfigSchema.safeParse(next);
  if (!result.success) throw new AIConfigError(result.error.issues as ReadonlyArray<AIConfigIssue>);
  await setSetting(db, AI_CONFIG_KEY, JSON.stringify(result.data));
  return result.data;
}
