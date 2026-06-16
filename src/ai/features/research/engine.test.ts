// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { ResearchEngineImpl, type ResearchEngineDeps } from "./engine";
import type { WebSearchProvider, ResearchGoal, ResearchEvent } from "./types";

/** A fake search provider that returns predefined results. */
class FakeSearchProvider implements WebSearchProvider {
  private results: Array<{ title: string; url: string; snippet: string; sourceType: string }> = [];

  setResults(r: typeof this.results): void {
    this.results = r;
  }

  async search(_query: string, _count?: number): Promise<Array<{ title: string; url: string; snippet: string; sourceType: string }>> {
    void _query; void _count;
    return this.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      sourceType: r.sourceType as "syllabus" | "courseware" | "textbook" | "video" | "article" | "other",
    }));
  }
}

/** Build a mock router that yields deltas from a response text. */
function mockRouter(responseText: string) {
  const chatFn = vi.fn();
  chatFn.mockImplementation(async function* () {
    for (const char of responseText) {
      yield { delta: char };
    }
  });
  return { chat: chatFn };
}

/** Collect all events from an async iterable. */
async function collectEvents(iter: AsyncIterable<ResearchEvent>): Promise<ResearchEvent[]> {
  const events: ResearchEvent[] = [];
  for await (const e of iter) {
    events.push(e);
  }
  return events;
}

/** Minimal valid course blueprint JSON for AI to return. */
const VALID_AI_RESPONSE = `Here are the course blueprints:

\`\`\`json
{
  "campaignTitle": "Learning Quantum Mechanics",
  "courses": [
    {
      "title": "Introduction to Quantum Mechanics",
      "domain": "Physics",
      "target": { "topic": "Quantum Mechanics", "scope": "course", "depth": "working" },
      "milestones": [
        { "order": 0, "capability": "Describe wave-particle duality", "description": "Understand the dual nature of light and matter", "difficulty": 2 },
        { "order": 1, "capability": "Solve the Schrödinger equation for simple potentials", "description": "Apply the Schrödinger equation to infinite wells and barriers", "difficulty": 3 }
      ],
      "cardSeeds": [
        { "front": "What is wave-particle duality?", "milestoneIndex": 0 },
        { "front": "Write the time-independent Schrödinger equation", "milestoneIndex": 1 }
      ],
      "retrievalQs": [
        { "question": "Explain the double-slit experiment", "milestoneIndex": 0, "answerSnippet": "Shows wave-particle duality of quantum entities" }
      ],
      "feynmanTargets": [
        { "concept": "Quantum superposition", "milestoneIndex": 0 }
      ],
      "resourceMap": []
    }
  ]
}
\`\`\`
`;

describe("ResearchEngineImpl", () => {
  it("yields error event for empty topic", async () => {
    const searchProvider = new FakeSearchProvider();
    const router = mockRouter("[]");
    const engine = new ResearchEngineImpl({
      router,
      searchProvider,
      vaultId: "vault-1",
    });

    const events = await collectEvents(
      engine.execute({ topic: "", description: undefined }),
    );

    const errorEvent = events.find((e) => e.phase === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toBe("Empty topic");
  });

  it("progresses through all phases and generates result", async () => {
    const searchProvider = new FakeSearchProvider();
    searchProvider.setResults([
      { title: "QM Textbook", url: "https://example.com/qm", snippet: "A textbook", sourceType: "textbook" },
      { title: "QM Course", url: "https://example.com/course", snippet: "A course", sourceType: "courseware" },
    ]);

    const router = mockRouter(VALID_AI_RESPONSE);
    const engine = new ResearchEngineImpl({
      router,
      searchProvider,
      vaultId: "vault-1",
    });

    const events = await collectEvents(
      engine.execute({ topic: "Quantum Mechanics", description: "I want to understand QM" }),
    );

    // Check phase sequence
    const phases = events.map((e) => e.phase);
    expect(phases).toContain("searching");
    expect(phases).toContain("fetching");
    expect(phases).toContain("evaluating");
    expect(phases).toContain("profiling");
    expect(phases).toContain("blueprinting");
    expect(phases).toContain("assembling");
    expect(phases).toContain("done");

    // Check result
    const result = engine.getResult();
    expect(result).not.toBeNull();
    expect(result?.goal.topic).toBe("Quantum Mechanics");
    expect(result?.courses).toHaveLength(1);
    expect(result?.courses[0].title).toBe("Introduction to Quantum Mechanics");
    expect(result?.courses[0].courseBlueprint.milestones).toHaveLength(2);
    expect(result?.campaignTitle).toBe("Learning Quantum Mechanics");
  });

  it("handles AI response with no valid blueprints", async () => {
    const searchProvider = new FakeSearchProvider();
    const router = mockRouter("I couldn't find any relevant materials.");
    const engine = new ResearchEngineImpl({
      router,
      searchProvider,
      vaultId: "vault-1",
    });

    const events = await collectEvents(
      engine.execute({ topic: "Obscure Topic" }),
    );

    const errorEvent = events.find((e) => e.phase === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toBe("No valid blueprints generated");
  });

  it("handles AI router error", async () => {
    const searchProvider = new FakeSearchProvider();

    const errorRouter = {
      chat: vi.fn(() => {
        throw new Error("AI provider unavailable");
      }),
    };

    const engine = new ResearchEngineImpl({
      router: errorRouter as unknown as ResearchEngineDeps["router"],
      searchProvider,
      vaultId: "vault-1",
    });

    const events = await collectEvents(
      engine.execute({ topic: "Test" }),
    );

    const errorEvent = events.find((e) => e.phase === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toContain("AI provider unavailable");
  });

  it("works with learning profile", async () => {
    const searchProvider = new FakeSearchProvider();
    searchProvider.setResults([
      { title: "Resource", url: "https://example.com", snippet: "Resource", sourceType: "article" },
    ]);

    const router = mockRouter(VALID_AI_RESPONSE);
    const engine = new ResearchEngineImpl({
      router,
      searchProvider,
      vaultId: "vault-1",
    });

    const goal: ResearchGoal = {
      topic: "Quantum Mechanics",
      learningProfile: {
        domain: "Physics",
        declaredLevel: "intermediate",
        knowledgeText: "I know classical mechanics well",
        timeBudget: "10 hours/week for 3 months",
        depthGoal: "mastery",
      },
    };

    const events = await collectEvents(engine.execute(goal));
    const profilingEvent = events.find((e) => e.phase === "profiling");
    expect(profilingEvent).toBeDefined();
    expect(profilingEvent?.message).toContain("intermediate");

    const result = engine.getResult();
    expect(result).not.toBeNull();
  });
});
