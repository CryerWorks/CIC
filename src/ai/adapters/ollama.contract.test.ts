import { runAdapterContract } from "../testing/contract";
import { streamChunks } from "../testing/fakeFetch";
import { OllamaAdapter } from "./ollama";
import { isLocalHost } from "../classification";

runAdapterContract([
  {
    name: "OllamaAdapter",
    needsApiKey: false,
    baseUrl: "http://localhost:11434",
    testModel: "llama3.2:3b",
    expectIsLocal: (u) => isLocalHost(u),
    makeAdapter: ({ fetchFn, baseUrl }) =>
      new OllamaAdapter({ id: "provider-id", baseUrl, fetchFn, defaultModel: "llama3.2:3b" }),
    vendor: {
      supportsEmbed: true,
      embedBatched: false,
      chatChunkOk: () =>
        streamChunks([
          '{"model":"llama3.2","message":{"role":"assistant","content":"Hel"},"done":false}\n',
          '{"model":"llama3.2","message":{"role":"assistant","content":"lo"},"done":false}\n',
          '{"model":"llama3.2","done":true}\n',
        ]),
      chatTerminalOnly: () => streamChunks(['{"model":"llama3.2","done":true}\n']),
      embedOkBody: () => ({ embedding: [0.1, 0.2, 0.3] }),
      authErrorResponse: () => ({ status: 401, body: { error: "unauthorized" } }),
      rateLimitResponse: () => ({ status: 429, body: { error: "rate limited" } }),
      badResponseResponse: () => ({ status: 200, body: "not json" }),
      probeOkBody: () => ({ models: [{ name: "llama3.2:3b" }] }),
    },
  },
]);
