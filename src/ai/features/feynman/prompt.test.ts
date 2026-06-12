// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildSocraticPrompt } from "./prompt";
import type { FeynmanMessage } from "./types";

function msg(role: "learner" | "tutor", content: string): FeynmanMessage {
  return { role, content };
}

describe("buildSocraticPrompt", () => {
  it("includes system prompt as the first message", () => {
    const result = buildSocraticPrompt({
      messages: [],
      contextChunks: [],
      learnerText: "Hello",
    });
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("Socratic tutor");
  });

  it("injects RAG context chunks into the system message", () => {
    const result = buildSocraticPrompt({
      messages: [],
      contextChunks: ["Chunk A: The chain rule...", "Chunk B: Derivatives..."],
      learnerText: "Explain",
    });
    expect(result[0].content).toContain("PROVIDED CONTEXT");
    expect(result[0].content).toContain("[1] Chunk A: The chain rule...");
    expect(result[0].content).toContain("[2] Chunk B: Derivatives...");
  });

  it("includes a note when no context chunks are available", () => {
    const result = buildSocraticPrompt({
      messages: [],
      contextChunks: [],
      learnerText: "Hello",
    });
    expect(result[0].content).toContain("No grounding context available");
  });

  it("converts learner messages to user role and tutor messages to assistant role", () => {
    const messages = [
      msg("learner", "I think the chain rule means..."),
      msg("tutor", "How does it relate to implicit differentiation?"),
    ];
    const result = buildSocraticPrompt({
      messages,
      contextChunks: [],
      learnerText: "New message",
    });
    expect(result[1].role).toBe("user");
    expect(result[1].content).toBe("I think the chain rule means...");
    expect(result[2].role).toBe("assistant");
    expect(result[2].content).toBe("How does it relate to implicit differentiation?");
  });

  it("appends the new learner message as the last user message", () => {
    const result = buildSocraticPrompt({
      messages: [],
      contextChunks: [],
      learnerText: "This is my newest explanation",
    });
    const last = result[result.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("This is my newest explanation");
  });

  it("truncates conversation history to MAX_MESSAGE_PAIRS (20 pairs)", () => {
    const messages: FeynmanMessage[] = [];
    for (let i = 0; i < 50; i++) {
      messages.push(msg("learner", `Learner message ${i}`));
      messages.push(msg("tutor", `Tutor response ${i}`));
    }
    const result = buildSocraticPrompt({
      messages,
      contextChunks: [],
      learnerText: "Final",
    });
    expect(result.length).toBe(42);
    expect(result[1].content).toBe("Learner message 30");
  });

  it("preserves all messages when total pairs are within limit", () => {
    const messages = [msg("learner", "L1"), msg("tutor", "T1")];
    const result = buildSocraticPrompt({
      messages,
      contextChunks: [],
      learnerText: "L2",
    });
    expect(result.length).toBe(4);
  });
});
