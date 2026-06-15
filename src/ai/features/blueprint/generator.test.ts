// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { BlueprintGeneratorImpl, extractJsonFromResponse } from "./generator";
import type { BlueprintTarget } from "./types";

/** Build a mock router that yields `{ delta: char }` for each character of the response text. */
function mockRouter(responses: string[] = []) {
  let callCount = 0;
  const chatFn = vi.fn();
  chatFn.mockImplementation(async function* () {
    const text = responses[callCount++] ?? "";
    for (const char of text) {
      yield { delta: char };
    }
  });
  return { chat: chatFn };
}

/** Build a mock router that throws on call. */
function errorRouter() {
  return {
    chat: vi.fn(() => {
      throw new Error("AI offline");
    }),
  };
}

const sampleBlueprintJson = `Here is the course structure I propose:

\`\`\`json
{
  "title": "Real Analysis Fundamentals",
  "domain": "Mathematics",
  "target": {
    "topic": "Real Analysis",
    "scope": "course",
    "depth": "working"
  },
  "milestones": [
    {
      "order": 0,
      "capability": "Define and prove limits using epsilon-delta",
      "description": "Master the formal definition of limits",
      "difficulty": 2
    }
  ],
  "cardSeeds": [
    {
      "front": "What is the epsilon-delta definition of a limit?",
      "milestoneIndex": 0
    }
  ],
  "retrievalQs": [
    {
      "question": "How do you prove a limit exists?",
      "milestoneIndex": 0,
      "answerSnippet": "Use epsilon-delta definition"
    }
  ],
  "feynmanTargets": [
    {
      "concept": "The Intermediate Value Theorem",
      "milestoneIndex": 0
    }
  ],
  "resourceMap": []
}
\`\`\`

Let me know what you think, or if you'd like to adjust the milestones.`;

const modeBResponse = `\`\`\`json
{
  "title": "Linear Algebra from Resources",
  "domain": "Mathematics",
  "target": {
    "topic": "Linear Algebra",
    "scope": "course",
    "depth": "working"
  },
  "milestones": [
    {
      "order": 0,
      "capability": "Solve systems of linear equations using matrix methods",
      "description": "Master Gaussian elimination and matrix operations",
      "difficulty": 1
    },
    {
      "order": 1,
      "capability": "Analyze vector spaces and linear transformations",
      "description": "Understand abstract vector space properties",
      "difficulty": 3
    }
  ],
  "cardSeeds": [
    {
      "front": "What is the row echelon form?",
      "milestoneIndex": 0
    },
    {
      "front": "What defines a vector space?",
      "milestoneIndex": 1
    }
  ],
  "retrievalQs": [
    {
      "question": "How do you determine if a set of vectors is linearly independent?",
      "milestoneIndex": 1,
      "answerSnippet": "Check if any vector is a linear combination of others"
    }
  ],
  "feynmanTargets": [
    {
      "concept": "Eigenvalues and eigenvectors",
      "milestoneIndex": 1
    }
  ],
  "resourceMap": [
    {
      "resourceId": "r1",
      "milestoneIndex": 0,
      "role": "primary"
    }
  ]
}
\`\`\``;

const target: BlueprintTarget = {
  topic: "Real Analysis",
  scope: "course",
  depth: "working",
  domainName: "Mathematics",
  currentLevel: "Some calculus background",
  timeBudget: "5 hours per week",
};

describe("BlueprintGeneratorImpl — Mode A (conversational sparring)", () => {
  it("starts a conversation cleanly", () => {
    const gen = new BlueprintGeneratorImpl({ router: mockRouter() });
    gen.startConversation(target);
    expect(gen.getMessages()).toHaveLength(0);
    expect(gen.getTarget()).toEqual(target);
  });

  it("sends a message and streams response", async () => {
    const router = mockRouter(["Good topic! Let me understand your background…"]);
    const gen = new BlueprintGeneratorImpl({ router });
    gen.startConversation(target);

    const chunks: string[] = [];
    for await (const chunk of gen.sendMessage("I want to learn Real Analysis")) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(gen.getMessages()).toHaveLength(2);
    expect(gen.getMessages()[0].role).toBe("user");
    expect(gen.getMessages()[1].role).toBe("assistant");
    expect(gen.getMessages()[1].content.length).toBeGreaterThan(0);
  });

  it("builds conversation history across multiple turns", async () => {
    const router = mockRouter(["First response.", "Second response."]);
    const gen = new BlueprintGeneratorImpl({ router });
    gen.startConversation(target);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of gen.sendMessage("Turn 1")) { /* consume */ }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of gen.sendMessage("Turn 2")) { /* consume */ }

    expect(gen.getMessages()).toHaveLength(4);
    expect(gen.getMessages()[0].content).toBe("Turn 1");
    expect(gen.getMessages()[2].content).toBe("Turn 2");
  });

  it("extracts blueprint from conversation when AI emits JSON", async () => {
    const router = mockRouter([sampleBlueprintJson]);
    const gen = new BlueprintGeneratorImpl({ router });
    gen.startConversation(target);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of gen.sendMessage("Let's design it")) { /* consume */ }

    const blueprint = gen.extractBlueprint();
    expect(blueprint).not.toBeNull();
    expect(blueprint!.title).toBe("Real Analysis Fundamentals");
    expect(blueprint!.domain).toBe("Mathematics");
    expect(blueprint!.milestones).toHaveLength(1);
    expect(blueprint!.cardSeeds).toHaveLength(1);
    expect(blueprint!.retrievalQs).toHaveLength(1);
    expect(blueprint!.feynmanTargets).toHaveLength(1);
  });

  it("returns null when no JSON block in conversation", async () => {
    const router = mockRouter(["That sounds like a great topic. Tell me more about your background."]);
    const gen = new BlueprintGeneratorImpl({ router });
    gen.startConversation(target);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of gen.sendMessage("Tell me about it")) { /* consume */ }

    expect(gen.extractBlueprint()).toBeNull();
  });

  it("handles AI errors gracefully in streaming", async () => {
    const gen = new BlueprintGeneratorImpl({ router: errorRouter() as unknown as ReturnType<typeof mockRouter> });
    gen.startConversation(target);

    const chunks: string[] = [];
    for await (const chunk of gen.sendMessage("Test")) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    const errorMsg = chunks.join("");
    expect(errorMsg).toContain("Error");
    expect(gen.getMessages()).toHaveLength(2);
    expect(gen.isActive).toBe(false);
  });

  it("returns target and can restart conversation", () => {
    const gen = new BlueprintGeneratorImpl({ router: mockRouter() });
    gen.startConversation(target);
    expect(gen.getTarget()).toEqual(target);

    const target2: BlueprintTarget = { topic: "Linear Algebra", scope: "course", depth: "mastery" };
    gen.startConversation(target2);
    expect(gen.getTarget()).toEqual(target2);
    expect(gen.getMessages()).toHaveLength(0);
  });

  it("calls router.chat with reasoning role and containsVaultContent", async () => {
    const router = mockRouter(["Response"]);
    const gen = new BlueprintGeneratorImpl({ router });
    gen.startConversation(target);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of gen.sendMessage("Hello")) { /* consume */ }

    expect(router.chat).toHaveBeenCalledWith(
      "reasoning",
      expect.any(Array),
      expect.objectContaining({ containsVaultContent: true }),
    );
  });
});

describe("BlueprintGeneratorImpl — Mode B (RAG synthesis)", () => {
  it("synthesizes a blueprint from context chunks", async () => {
    const router = mockRouter([modeBResponse]);
    const gen = new BlueprintGeneratorImpl({ router });

    const contextChunks = [
      "[source: Linear Algebra Textbook, Ch 1] Matrices and matrix operations...",
      "[source: Linear Algebra Textbook, Ch 4] Vector spaces...",
    ];

    const blueprint = await gen.synthesize(target, contextChunks);

    expect(blueprint.title).toBe("Linear Algebra from Resources");
    expect(blueprint.milestones).toHaveLength(2);
    expect(blueprint.cardSeeds).toHaveLength(2);
    expect(blueprint.resourceMap).toHaveLength(1);
    expect(blueprint.resourceMap[0].resourceId).toBe("r1");
  });

  it("throws on AI error", async () => {
    const gen = new BlueprintGeneratorImpl({ router: errorRouter() as unknown as ReturnType<typeof mockRouter> });

    await expect(gen.synthesize(target, ["context"])).rejects.toThrow("Blueprint synthesis failed");
  });

  it("throws when no parseable blueprint in response", async () => {
    const router = mockRouter(["This is not a valid blueprint response."]);
    const gen = new BlueprintGeneratorImpl({ router });

    await expect(gen.synthesize(target, ["context"])).rejects.toThrow("no parseable blueprint");
  });

  it("stores response as conversation messages", async () => {
    const router = mockRouter([modeBResponse]);
    const gen = new BlueprintGeneratorImpl({ router });

    await gen.synthesize(target, ["context"]);

    expect(gen.getMessages()).toHaveLength(1);
    expect(gen.getMessages()[0].role).toBe("assistant");
  });

  it("sets target from synthesize call", async () => {
    const router = mockRouter([modeBResponse]);
    const gen = new BlueprintGeneratorImpl({ router });

    await gen.synthesize(target, ["context"]);

    expect(gen.getTarget()).toEqual(target);
  });
});

describe("extractJsonFromResponse", () => {
  it("extracts JSON from a markdown code block", () => {
    const text = `Some text\`\`\`json\n{"key": "value"}\n\`\`\`more text`;
    const result = extractJsonFromResponse(text);
    expect(result).toEqual({ key: "value" });
  });

  it("returns null when no JSON code block", () => {
    expect(extractJsonFromResponse("Just text")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const text = "```json\n{invalid}\n```";
    const result = extractJsonFromResponse(text);
    expect(result).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    const text = '```json\n"string"\n```';
    const result = extractJsonFromResponse(text);
    expect(result).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractJsonFromResponse("")).toBeNull();
  });

  it("handles JSON with no surrounding text", () => {
    const result = extractJsonFromResponse('```json\n{"a": 1}\n```');
    expect(result).toEqual({ a: 1 });
  });
});
