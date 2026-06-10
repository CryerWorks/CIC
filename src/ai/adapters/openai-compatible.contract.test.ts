import { runAdapterContract } from "../testing/contract";
import { streamChunks } from "../testing/fakeFetch";
import { OpenAICompatibleAdapter } from "./openai-compatible";
import { isLocalHost } from "../classification";

runAdapterContract([
  {
    name: "OpenAICompatibleAdapter",
    needsApiKey: true,
    baseUrl: "https://api.openai.com",
    testModel: "gpt-4o-mini",
    expectIsLocal: (u) => isLocalHost(u),
    makeAdapter: ({ fetchFn, baseUrl, secrets, apiKeyRef }) =>
      new OpenAICompatibleAdapter({
        id: "provider-id",
        baseUrl,
        apiKeyRef: apiKeyRef!,
        secrets,
        fetchFn,
      }),
    vendor: {
      supportsEmbed: true,
      embedBatched: true,
      chatChunkOk: () =>
        streamChunks([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      chatTerminalOnly: () => streamChunks(["data: [DONE]\n\n"]),
      embedOkBody: (n) => ({
        data: Array.from({ length: n }, (_, i) => ({ embedding: [0.1, 0.2], index: i })),
        model: "text-embedding-3-small",
      }),
      authErrorResponse: () => ({ status: 401, body: { error: "invalid api key" } }),
      rateLimitResponse: () => ({ status: 429, body: { error: "throttled" } }),
      badResponseResponse: () => ({ status: 200, body: "not sse" }),
      probeOkBody: () => ({ data: [{ id: "gpt-4o", object: "model" }] }),
    },
  },
]);
