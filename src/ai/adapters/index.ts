/**
 * Adapter factory (Feature 016). The composition root calls `createProvider(config, secrets)` to
 * instantiate a `Provider` for each configured `ProviderConfig`. This is the ONLY public export of
 * the adapters directory; the three adapter classes are not re-exported from here so feature code
 * outside `src/ai/adapters/**` cannot import them directly (boundary asserted by T073a).
 *
 * Production wiring (Phase 4): all three adapters land below as `case` arms. During Phase 2 only
 * Ollama (US1) is implemented; the other two `case` arms throw "Not implemented" until US2.
 */

import type { Provider } from "../provider";
import type { ProviderConfig } from "../config";
import type { SecretStore } from "../secrets";
import { OllamaAdapter } from "./ollama";
import { OpenAICompatibleAdapter } from "./openai-compatible";
import { AnthropicAdapter } from "./anthropic";

export function createProvider(
  config: ProviderConfig,
  secrets: SecretStore,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Provider {
  switch (config.type) {
    case "ollama":
      return new OllamaAdapter({
        id: config.id,
        baseUrl: config.baseUrl!,
        defaultModel: config.defaultModel,
        embedModel: config.embedModel,
        fetchFn,
      });
    case "openai-compatible":
      return new OpenAICompatibleAdapter({
        id: config.id,
        baseUrl: config.baseUrl!,
        // apiKeyRef may be undefined for keyless local servers (LM Studio, llama.cpp, vLLM).
        apiKeyRef: config.apiKeyRef,
        secrets,
        defaultModel: config.defaultModel,
        embedModel: config.embedModel,
        fetchFn,
      });
    case "anthropic":
      return new AnthropicAdapter({
        id: config.id,
        apiKeyRef: config.apiKeyRef!,
        secrets,
        defaultModel: config.defaultModel,
        fetchFn,
      });
  }
}
