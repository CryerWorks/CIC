import type { AIRouter } from "../router";
import type { ChunkInput } from "./types";

const BATCH_SIZE = 20;

export interface EmbedderResult {
  chunks: ChunkInput[];
  /** Number of API calls made (1 per batch). */
  apiCalls: number;
}

/**
 * Batch-embed chunks via `router.embed('embeddings', …)`.
 * Lockdown gate fires automatically inside the router (FR-011).
 * Caller is responsible for transaction rollback on error (FR-012).
 */
export async function embedChunks(
  chunks: Omit<ChunkInput, "embedding">[],
  router: AIRouter,
  signal?: AbortSignal,
): Promise<EmbedderResult> {
  if (chunks.length === 0) return { chunks: [], apiCalls: 0 };

  const results: ChunkInput[] = [];
  let apiCalls = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.textContent);

    const result = await router.embed("embeddings", texts, {
      containsVaultContent: true,
      signal,
    });
    apiCalls++;

    if (result.vectors.length !== batch.length) {
      throw new Error(
        `Embedding batch size mismatch: expected ${batch.length} vectors, got ${result.vectors.length}`,
      );
    }

    for (let j = 0; j < batch.length; j++) {
      const vec = result.vectors[j];
      if (!vec || vec.length === 0) {
        throw new Error(`Embedding returned empty vector for chunk at index ${i + j}`);
      }
      results.push({ ...batch[j], embedding: new Float32Array(vec) });
    }
  }

  return { chunks: results, apiCalls };
}
