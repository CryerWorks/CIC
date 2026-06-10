/**
 * AIRouter interface (Feature 016 / Constitution II). The single chokepoint every AI feature
 * consumes — never an adapter directly. The router enforces the lockdown gate (at every step of
 * the fallback walk per L1/C1), resolves role → RoleTarget, walks the fallback chain on
 * retryable errors, and surfaces non-retryable errors immediately.
 *
 * Spine file. Implementation in `src/ai/routerImpl.ts` (deep). Full contract:
 * [specs/016-ai-provider-layer/contracts/router.md](../../specs/016-ai-provider-layer/contracts/router.md).
 */

import type { AIRole } from "./config";
import type {
  ChatMessage,
  ChatOptions,
  ChatChunk,
  EmbedOptions,
  EmbedResult,
  ProbeOutcome,
} from "./provider";

export interface AIRouter {
  /** Streaming chat call routed by role. Honors lockdown gate, fallback walk, auth event. */
  chat(role: AIRole, messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk>;

  /** Embedding call routed by role. Same lockdown gate as `chat`. Includes capability re-route. */
  embed(role: AIRole, texts: string[], opts: EmbedOptions): Promise<EmbedResult>;

  /**
   * Live reachability probe for a configured provider. Returns the cached result by default —
   * settings UIs render without re-pinging on every mount. Pass `force:true` for the
   * "Test connection" button and on first config save: the router will then invoke the
   * adapter's live `probe()`, which makes one cheap HTTP call to verify reachability + auth +
   * latency. Throws `ProviderError` on failure.
   */
  probe(providerId: string, opts?: { force?: boolean; signal?: AbortSignal }): Promise<ProbeOutcome>;
}
