import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// vi.hoisted so the module-mock factory can reference the spy.
const { confirmSpy } = vi.hoisted(() => ({ confirmSpy: vi.fn(() => true) }));
// Global confirm() is used by AISection's Reset button.
beforeEach(() => {
  (globalThis as { confirm?: typeof confirm }).confirm = confirmSpy as unknown as typeof confirm;
  confirmSpy.mockReset();
  confirmSpy.mockReturnValue(true);
});

import { renderApp, makeReadyDb } from "../../../app/test-support";
import { InMemorySecretStore } from "../../../ai/secrets";
import { setSetting } from "../../../db/repositories/settings";
import { AI_CONFIG_KEY, loadAIConfig } from "../../../ai/config";
import { createProvider as realCreateProvider } from "../../../ai/adapters";
import type { Provider, ChatChunk } from "../../../ai/provider";
import type { SqlExecutor } from "../../../db";

function fakeAdapter(id: string): Provider {
  const caps = {
    chat: true,
    embeddings: true,
    streaming: true,
    tools: false,
    isLocal: true,
  };
  return {
    id,
    type: "ollama",
    capabilities: () => caps,
    async probe() {
      return { ...caps, latencyMs: 2 };
    },
    async *chat(): AsyncIterable<ChatChunk> {
      yield { delta: "", done: true };
    },
    async embed(texts) {
      return { vectors: texts.map(() => [0]), model: "fake", dimensions: 1 };
    },
  };
}

function renderSettings(db: SqlExecutor, secrets?: InMemorySecretStore) {
  return renderApp({
    initialEntries: ["/settings"],
    initialize: () => Promise.resolve(db),
    secretStore: secrets ?? new InMemorySecretStore(),
    createProviderFn: (cfg, sec, fetchFn) => {
      // Use a stub for ollama so probe() works without HTTP; route everything else through the
      // real factory (tests don't exercise OpenAI-compat or Anthropic here).
      if (cfg.type === "ollama") return fakeAdapter(cfg.id);
      return realCreateProvider(cfg, sec, fetchFn);
    },
  });
}

describe("AISection — happy path (US1)", () => {
  it("renders the empty state when no provider is configured", async () => {
    const db = await makeReadyDb();
    renderSettings(db);

    expect(
      await screen.findByText(/No providers configured yet/i, undefined, { timeout: 4000 }),
    ).toBeTruthy();
  });

  it("adds an Ollama provider end-to-end — persists with all required fields", { timeout: 20_000 }, async () => {
    const db = await makeReadyDb();
    renderSettings(db);

    await userEvent.click(await screen.findByRole("button", { name: "+ Add provider" }, { timeout: 4000 }));
    await userEvent.type(screen.getByLabelText("Provider id"), "ollama-local");
    await userEvent.type(screen.getByLabelText("Provider label"), "Local Ollama");
    // Type defaults to ollama; baseUrl pre-filled with localhost.
    await userEvent.click(screen.getByRole("button", { name: "Add provider" }));

    // The persisted config has the row with the expected fields.
    await waitFor(
      async () => {
        const cfg = await loadAIConfig(db);
        const p = cfg.providers.find((x) => x.id === "ollama-local");
        expect(p).toBeDefined();
        expect(p?.type).toBe("ollama");
        expect(p?.label).toBe("Local Ollama");
        expect(p?.baseUrl).toBe("http://localhost:11434");
        // version bumps once on save.
        expect(cfg.version).toBe(1);
      },
      { timeout: 10_000 },
    );
  });
});

describe("AISection — corruption recovery (T028a / FR-003)", () => {
  it("renders the 'Reset?' callout when the on-disk AIConfig is corrupt + reset clears it", async () => {
    const db = await makeReadyDb();
    await setSetting(db, AI_CONFIG_KEY, "{ this is not json");
    renderSettings(db);

    expect(
      await screen.findByText("Your AI configuration could not be loaded", undefined, { timeout: 4000 }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset to defaults" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(confirmSpy).toHaveBeenCalled();

    await waitFor(async () => {
      const cfg = await loadAIConfig(db);
      expect(cfg.providers).toEqual([]);
      expect(cfg.lockdown).toBe(false);
    });
  });
});

describe("AISection — lockdown toggle (US1 / FR-011)", () => {
  it("toggling the lockdown switch persists to AIConfig.lockdown", async () => {
    const db = await makeReadyDb();
    renderSettings(db);

    await waitFor(() => expect(screen.queryByLabelText("Local-only lockdown")).not.toBeNull(), { timeout: 4000 });
    await userEvent.click(screen.getByLabelText("Local-only lockdown"));

    await waitFor(async () => {
      const cfg = await loadAIConfig(db);
      expect(cfg.lockdown).toBe(true);
    });
  });
});
