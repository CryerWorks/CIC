import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoleRoutingEditor } from "./RoleRoutingEditor";
import type { AIConfig } from "../../../ai/config";

/**
 * Scenario E regression (Feature 016, live-surfaced). The role-routing dropdown appeared to "stick"
 * on "— none —" and the model field rejected input, because:
 *   (1) selecting a provider tried to persist `{ providerId, model: "" }`, which fails
 *       `RoleTargetSchema.model = z.string().min(1)` → the save threw and was silently swallowed; and
 *   (2) the model input was controlled by persisted config with no local state, so typing either
 *       round-tripped per keystroke or (with no provider) reset the target to null.
 * The fix: local state in the step editor + default-model prefill + commit only complete targets.
 */

function makeConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    providers: [
      {
        id: "lmstudio",
        type: "openai-compatible",
        label: "LM Studio",
        baseUrl: "http://127.0.0.1:1234",
        apiKeyRef: "lmstudio",
        defaultModel: "google/gemma-4-e4b",
      },
      // No defaultModel → exercises the "type a model, commit on blur" path.
      { id: "ollama", type: "ollama", label: "Ollama", baseUrl: "http://localhost:11434" },
    ],
    routing: { reasoning: null, drafting: null, embeddings: null },
    lockdown: false,
    version: 1,
    ...overrides,
  };
}

describe("RoleRoutingEditor — Scenario E regression", () => {
  it("selecting a provider with a default model persists a complete target (non-empty model)", async () => {
    const onSetTarget = vi.fn().mockResolvedValue(undefined);
    render(
      <RoleRoutingEditor
        config={makeConfig()}
        onSetTarget={onSetTarget}
        onAddFallback={vi.fn()}
        onRemoveFallback={vi.fn()}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText("Provider for reasoning"), "lmstudio");

    expect(onSetTarget).toHaveBeenCalledWith("reasoning", {
      providerId: "lmstudio",
      model: "google/gemma-4-e4b",
    });
  });

  it("the model field is editable and commits on blur for a provider without a default model", async () => {
    const onSetTarget = vi.fn().mockResolvedValue(undefined);
    render(
      <RoleRoutingEditor
        config={makeConfig()}
        onSetTarget={onSetTarget}
        onAddFallback={vi.fn()}
        onRemoveFallback={vi.fn()}
      />,
    );

    // Pick the no-default-model provider on the drafting row — nothing should persist yet.
    await userEvent.selectOptions(screen.getByLabelText("Provider for drafting"), "ollama");
    expect(onSetTarget).not.toHaveBeenCalled();

    // The model input must be editable (the original bug: it reset on every keystroke).
    const modelInput = screen.getByLabelText("Model for drafting") as HTMLInputElement;
    await userEvent.type(modelInput, "llama3.2:3b");
    expect(modelInput.value).toBe("llama3.2:3b");

    // Commit on blur → a complete target persists.
    await userEvent.tab();
    expect(onSetTarget).toHaveBeenCalledWith("drafting", {
      providerId: "ollama",
      model: "llama3.2:3b",
    });
  });

  it("selecting — none — clears the target to null", async () => {
    const onSetTarget = vi.fn().mockResolvedValue(undefined);
    render(
      <RoleRoutingEditor
        config={makeConfig({
          routing: {
            reasoning: { providerId: "lmstudio", model: "google/gemma-4-e4b" },
            drafting: null,
            embeddings: null,
          },
        })}
        onSetTarget={onSetTarget}
        onAddFallback={vi.fn()}
        onRemoveFallback={vi.fn()}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText("Provider for reasoning"), "");
    expect(onSetTarget).toHaveBeenCalledWith("reasoning", null);
  });
});
