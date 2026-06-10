# Contract: AIConfig — Schema, Load, Save

**File**: `src/ai/config.ts` (spine). The zod-validated configuration document + the two functions that persist it.

## TypeScript shape

```ts
export type AIRole = 'reasoning' | 'drafting' | 'embeddings';

import type { ProviderType } from './provider';

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl?: string;
  apiKeyRef?: string;
  defaultModel?: string;
  embedModel?: string;
}

export interface RoleTarget {
  providerId: string;
  model: string;
  fallback?: RoleTarget;
}

export interface AIConfig {
  providers: ProviderConfig[];
  routing: Record<AIRole, RoleTarget | null>;
  lockdown: boolean;
  version: number;
}

/** zod schemas — used to validate every load AND every save (defense in depth). */
export const ProviderConfigSchema: z.ZodType<ProviderConfig>;
export const RoleTargetSchema: z.ZodType<RoleTarget>;
export const AIConfigSchema: z.ZodType<AIConfig>;

/** Returns a fresh, empty config (no providers, all roles `null`, lockdown OFF, version 0). */
export function emptyAIConfig(): AIConfig;

/** Loads from SQLite settings table key `ai.config`. Returns `emptyAIConfig()` if absent. */
export async function loadAIConfig(db: SqlExecutor): Promise<AIConfig>;

/** Validates + persists. Increments `version`. Throws AIConfigError on validation failure. */
export async function saveAIConfig(db: SqlExecutor, config: AIConfig): Promise<AIConfig>;

export class AIConfigError extends Error { readonly issues: z.ZodIssue[]; }
```

## Zod constraints (the schema)

```text
ProviderConfigSchema:
  id          :  string, 1..64 chars, /^[a-z0-9][a-z0-9-]*$/
  type        :  z.enum(['ollama', 'openai-compatible', 'anthropic'])
  label       :  string, 1..80 chars (trimmed)
  baseUrl     :  optional, string, parsed by z.string().url()
  apiKeyRef   :  optional, string, 1..64 chars
  defaultModel:  optional, string, 1..120 chars
  embedModel  :  optional, string, 1..120 chars

  refine (per-type):
    type === 'ollama'             → baseUrl present (default applied in form: 'http://localhost:11434')
    type === 'openai-compatible'  → baseUrl present AND apiKeyRef present
    type === 'anthropic'          → apiKeyRef present (baseUrl absent / ignored)

  refine (id ↔ apiKeyRef):
    when apiKeyRef present, apiKeyRef === id  (v1: no separate ref namespace)

RoleTargetSchema (recursive):
  providerId  :  string, 1..64 chars
  model       :  string, 1..120 chars
  fallback    :  optional, RoleTargetSchema (recursive)

  refine (acyclic): visited Set of providerIds at every recursion step rejects a cycle.

AIConfigSchema:
  providers   :  ProviderConfigSchema[], with array-level refine: all `id`s distinct
  routing     :  record of exactly 3 keys (AIRole) → RoleTarget | null
                 with refine: every RoleTarget.providerId at every recursion level
                              MUST exist in providers[].id
  lockdown    :  boolean
  version     :  z.number().int().nonnegative()
```

## Load semantics (`loadAIConfig`)

```
1. SELECT value FROM settings WHERE key = 'ai.config'
2. If no row: return emptyAIConfig().
3. JSON.parse the value. If parse fails: throw AIConfigError with one synthesized issue.
4. AIConfigSchema.safeParse(parsed):
   - on success: return parsed config
   - on failure: throw AIConfigError(issues: result.error.issues)
5. The settings UI catches AIConfigError and surfaces a "Your AI config is corrupt — reset?"
   dialog. No app crash on bad config (FR-014).
```

## Save semantics (`saveAIConfig`)

```
1. AIConfigSchema.safeParse(config). On failure: throw AIConfigError.
2. Bump version (input.version + 1).
3. INSERT INTO settings(key='ai.config', value=JSON.stringify(validated)) ON CONFLICT(key) DO UPDATE SET value=excluded.value.
4. Return the saved config (with new version).
```

**Key invariants enforced at save**:
- Provider id uniqueness.
- Role-target referential integrity (every providerId at every fallback depth must be a known provider).
- Cycle-free fallback chains.
- Lockdown stays a plain boolean.
- The version bump is monotonic.

**Save does NOT touch the keychain.** Secret storage is a separate `SecretStore.set(ref, value)` call orchestrated by the settings UI hook before `saveAIConfig` runs (see [secrets.md](secrets.md) for the SecretStore contract and [ui-settings.md](ui-settings.md) for the orchestration).

## Persistence location

- **Key**: `'ai.config'` (string literal, exported as `AI_CONFIG_KEY`).
- **Table**: existing `settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)` (migration `m0002`).
- **Value**: JSON.stringify'd `AIConfig`. UTF-8. No newlines except those inside the JSON.

The settings table already hosts:
- `vault.path` (since 006)
- `vault.lastKnownId` (since 009)
- `notifications.enabled` / `notifications.time` / `notifications.lastFired` (since 014)
- `srs.dailyNewCap` (since 010)

`ai.config` joins them as another typed-blob key. No table change needed.

## Version field semantics

`version` is monotonic, increments on every successful save. The `AIProvider` composition root reads it on first mount; on a `'storage'`-style invalidation event from the settings UI, it re-loads, compares versions, and re-instantiates the router if the version advanced. (Single in-process app, no SQLite WAL polling — the UI fires an in-process event after save.)

## Test surface (`src/ai/config.test.ts`)

- `emptyAIConfig()` parses cleanly through `AIConfigSchema`.
- A round-trip (`save → load`) preserves every field and bumps version by 1.
- Duplicate provider id throws `AIConfigError` with an issue mentioning "id".
- A `RoleTarget.providerId` referencing a non-existent provider throws.
- A cyclic fallback chain throws.
- `loadAIConfig` on an empty table returns `emptyAIConfig()`.
- `loadAIConfig` on a corrupt JSON value throws `AIConfigError`; the table row is left untouched.
- `loadAIConfig` on a JSON that parses but fails zod throws `AIConfigError` with the issues array.
- The full schema accepts the ai-provider-layer.md §4 example configurations (`local-first`, `remote-with-local-fallback`, `embeddings-local-everything-else-remote`).
