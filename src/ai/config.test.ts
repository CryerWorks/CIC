// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../db/adapters/node";
import { migrate } from "../db";
import {
  AI_CONFIG_KEY,
  AIConfigError,
  AIConfigSchema,
  emptyAIConfig,
  loadAIConfig,
  saveAIConfig,
  type AIConfig,
  type RoleTarget,
} from "./config";
import { setSetting } from "../db/repositories/settings";

async function freshDb() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

describe("AIConfigSchema + emptyAIConfig", () => {
  it("emptyAIConfig parses cleanly", () => {
    const parsed = AIConfigSchema.safeParse(emptyAIConfig());
    expect(parsed.success).toBe(true);
  });

  it("rejects duplicate provider id", () => {
    const cfg = {
      ...emptyAIConfig(),
      providers: [
        { id: "ollama-local", type: "ollama", label: "A", baseUrl: "http://localhost:11434" },
        { id: "ollama-local", type: "ollama", label: "B", baseUrl: "http://localhost:11434" },
      ],
    };
    const result = AIConfigSchema.safeParse(cfg);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /duplicate provider id/.test(i.message))).toBe(true);
    }
  });

  it("rejects a routing target that refers to an unknown provider", () => {
    const cfg: AIConfig = {
      ...emptyAIConfig(),
      providers: [
        { id: "ollama-local", type: "ollama", label: "L", baseUrl: "http://localhost:11434" },
      ],
      routing: {
        reasoning: { providerId: "does-not-exist", model: "llama3.2" },
        drafting: null,
        embeddings: null,
      },
    };
    const result = AIConfigSchema.safeParse(cfg);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /unknown provider/.test(i.message))).toBe(true);
    }
  });

  it("rejects a cyclic fallback chain", () => {
    const a: RoleTarget = { providerId: "ollama-local", model: "m" };
    const b: RoleTarget = { providerId: "ollama-local", model: "m2", fallback: a };
    const cfg: AIConfig = {
      ...emptyAIConfig(),
      providers: [
        { id: "ollama-local", type: "ollama", label: "L", baseUrl: "http://localhost:11434" },
      ],
      routing: {
        reasoning: b,
        drafting: null,
        embeddings: null,
      },
    };
    const result = AIConfigSchema.safeParse(cfg);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /cyclic fallback chain/.test(i.message))).toBe(true);
    }
  });

  it("rejects an ollama provider missing baseUrl", () => {
    const cfg = {
      ...emptyAIConfig(),
      providers: [{ id: "x", type: "ollama", label: "X" }],
    };
    expect(AIConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("accepts an openai-compatible provider with NO apiKeyRef (keyless local server path)", () => {
    // Post-LM-Studio fix: keyless local servers (LM Studio, llama.cpp `--server`, vLLM) are a
    // first-class openai-compatible config — apiKeyRef is optional.
    const cfg = {
      ...emptyAIConfig(),
      providers: [{ id: "x", type: "openai-compatible", label: "X", baseUrl: "http://localhost:1234" }],
    };
    expect(AIConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it("rejects an openai-compatible provider missing baseUrl (always required)", () => {
    const cfg = {
      ...emptyAIConfig(),
      providers: [{ id: "x", type: "openai-compatible", label: "X" }],
    };
    expect(AIConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("rejects an anthropic provider missing apiKeyRef", () => {
    const cfg = {
      ...emptyAIConfig(),
      providers: [{ id: "x", type: "anthropic", label: "X" }],
    };
    expect(AIConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("rejects apiKeyRef that doesn't equal id (v1 invariant)", () => {
    const cfg = {
      ...emptyAIConfig(),
      providers: [
        { id: "openai-1", type: "openai-compatible", label: "X", baseUrl: "https://api.openai.com", apiKeyRef: "different" },
      ],
    };
    expect(AIConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("accepts a fully wired three-provider example", () => {
    const cfg: AIConfig = {
      providers: [
        { id: "ollama-local", type: "ollama", label: "Local Ollama", baseUrl: "http://localhost:11434", defaultModel: "llama3.2:3b" },
        { id: "openrouter", type: "openai-compatible", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKeyRef: "openrouter", defaultModel: "anthropic/claude-3.5-sonnet" },
        { id: "anthropic", type: "anthropic", label: "Anthropic", apiKeyRef: "anthropic", defaultModel: "claude-3-5-sonnet-20241022" },
      ],
      routing: {
        reasoning: { providerId: "openrouter", model: "anthropic/claude-3.5-sonnet", fallback: { providerId: "ollama-local", model: "llama3.2:3b" } },
        drafting: { providerId: "ollama-local", model: "llama3.2:3b" },
        embeddings: { providerId: "ollama-local", model: "nomic-embed-text" },
      },
      lockdown: true,
      version: 5,
    };
    const result = AIConfigSchema.safeParse(cfg);
    if (!result.success) throw new Error(JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });
});

describe("loadAIConfig / saveAIConfig", () => {
  it("returns emptyAIConfig() when no row exists", async () => {
    const db = await freshDb();
    const cfg = await loadAIConfig(db);
    expect(cfg).toEqual(emptyAIConfig());
  });

  it("round-trips a save→load and bumps version by 1", async () => {
    const db = await freshDb();
    const input: AIConfig = {
      ...emptyAIConfig(),
      providers: [{ id: "ollama-local", type: "ollama", label: "Local", baseUrl: "http://localhost:11434" }],
      routing: {
        reasoning: { providerId: "ollama-local", model: "llama3.2" },
        drafting: null,
        embeddings: null,
      },
      lockdown: true,
    };
    const saved = await saveAIConfig(db, input);
    expect(saved.version).toBe(1);
    const loaded = await loadAIConfig(db);
    expect(loaded.version).toBe(1);
    expect(loaded.providers).toEqual(input.providers);
    expect(loaded.routing.reasoning).toEqual(input.routing.reasoning);
    expect(loaded.lockdown).toBe(true);

    const saved2 = await saveAIConfig(db, saved);
    expect(saved2.version).toBe(2);
  });

  it("saveAIConfig throws AIConfigError on invalid input and leaves the DB row untouched", async () => {
    const db = await freshDb();
    const ok: AIConfig = {
      ...emptyAIConfig(),
      providers: [{ id: "ollama-local", type: "ollama", label: "L", baseUrl: "http://localhost:11434" }],
    };
    await saveAIConfig(db, ok);

    const bad = { ...emptyAIConfig(), providers: [{ id: "BAD UPPER", type: "ollama", label: "X", baseUrl: "http://localhost" }] } as unknown as AIConfig;
    await expect(saveAIConfig(db, bad)).rejects.toBeInstanceOf(AIConfigError);

    // Unchanged
    const after = await loadAIConfig(db);
    expect(after.providers.length).toBe(1);
    expect(after.providers[0].id).toBe("ollama-local");
  });

  it("loadAIConfig throws AIConfigError on corrupt JSON", async () => {
    const db = await freshDb();
    await setSetting(db, AI_CONFIG_KEY, "{ this is not JSON");
    await expect(loadAIConfig(db)).rejects.toBeInstanceOf(AIConfigError);
  });

  it("loadAIConfig throws AIConfigError on JSON that fails the schema", async () => {
    const db = await freshDb();
    await setSetting(db, AI_CONFIG_KEY, JSON.stringify({ providers: "nope" }));
    await expect(loadAIConfig(db)).rejects.toBeInstanceOf(AIConfigError);
  });
});
