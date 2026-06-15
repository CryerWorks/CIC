// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { QuizGeneratorImpl } from "./generator";
import { parseQuizResponse } from "./prompt";

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
  return {
    chat: chatFn,
  };
}

/** Build a mock router that throws on the first call. */
function errorRouter() {
  return {
    chat: vi.fn(() => {
      throw new Error("AI offline");
    }),
  };
}

describe("QuizGeneratorImpl", () => {
  it("generates and parses questions from Q:/A: formatted response", async () => {
    const response = `Q: What is the chain rule in calculus?
A: The chain rule is used to differentiate composite functions.

Q: How does gradient descent work?
A: Gradient descent iteratively moves parameters in the direction of the negative gradient to minimize a loss function.`;
    const router = mockRouter([response]);
    const gen = new QuizGeneratorImpl({ router });

    const questions = await gen.generate("Calculus", ["Chain rule states...", "Gradient descent..."]);

    expect(questions).toHaveLength(2);
    expect(questions[0].question).toBe("What is the chain rule in calculus?");
    expect(questions[0].answer).toContain("chain rule");
    expect(questions[1].question).toContain("gradient descent");
  });

  it("passes context chunks and count to the prompt", async () => {
    const response = `Q: Test question?
A: Test answer.`;
    const router = mockRouter([response]);
    const gen = new QuizGeneratorImpl({ router });

    await gen.generate("Topic", ["Context chunk"], undefined, 3);

    // Verify router was called with containsVaultContent: true
    expect(router.chat).toHaveBeenCalledWith(
      "reasoning",
      expect.any(Array),
      expect.objectContaining({ containsVaultContent: true }),
    );

    // Verify the messages contain the context and count
    const calls = router.chat.mock.calls;
    const messages = calls[0][1] as Array<{ role: string; content: string }>;
    const systemMsg = messages[0].content;
    expect(systemMsg).toContain("Context chunk");
    expect(systemMsg).toContain("3");
  });

  it("throws on empty response", async () => {
    const router = mockRouter([""]);
    const gen = new QuizGeneratorImpl({ router });

    await expect(gen.generate("Topic", [])).rejects.toThrow("no parseable questions");
  });

  it("throws on AI error", async () => {
    const gen = new QuizGeneratorImpl({ router: errorRouter() as unknown as ReturnType<typeof mockRouter> });

    await expect(gen.generate("Topic", [])).rejects.toThrow("Quiz generation failed");
  });

  it("includes previous questions for surface-form variability", async () => {
    const response = `Q: New question?
A: New answer.`;
    const router = mockRouter([response]);
    const gen = new QuizGeneratorImpl({ router });

    await gen.generate("Topic", [], ["Old Q1?", "Old Q2?"]);

    const calls = vi.mocked(router.chat).mock.calls;
    const messages = calls[0][1] as Array<{ role: string; content: string }>;
    const systemMsg = messages[0].content;
    expect(systemMsg).toContain("PREVIOUS QUIZ QUESTIONS");
    expect(systemMsg).toContain("Old Q1?");
    expect(systemMsg).toContain("Old Q2?");
  });

  it("works without previous questions", async () => {
    const response = `Q: Test?
A: Answer.`;
    const router = mockRouter([response]);
    const gen = new QuizGeneratorImpl({ router });

    const questions = await gen.generate("Topic", []);

    expect(questions).toHaveLength(1);
    const calls = vi.mocked(router.chat).mock.calls;
    const messages = calls[0][1] as Array<{ role: string; content: string }>;
    const systemMsg = messages[0].content;
    expect(systemMsg).not.toContain("PREVIOUS QUIZ QUESTIONS");
  });
});

describe("parseQuizResponse", () => {
  it("parses a single Q:/A: pair", () => {
    const result = parseQuizResponse("Q: What is calculus?\nA: The study of change.");
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe("What is calculus?");
    expect(result[0].answer).toBe("The study of change.");
  });

  it("parses multiple Q:/A: pairs separated by blank lines", () => {
    const text = `Q: Question 1?
A: Answer 1.

Q: Question 2?
A: Answer 2.`;
    const result = parseQuizResponse(text);
    expect(result).toHaveLength(2);
  });

  it("handles extra whitespace and blank lines before Q:", () => {
    const text = `\n  \nQ: First?
A: First answer.`;
    const result = parseQuizResponse(text);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe("First?");
  });

  it("handles multi-line answers", () => {
    const text = `Q: Complex?
A: This is a multi-line
answer that spans
multiple lines.`;
    const result = parseQuizResponse(text);
    expect(result).toHaveLength(1);
    expect(result[0].answer).toBe("This is a multi-line\nanswer that spans\nmultiple lines.");
  });

  it("returns empty array for text without Q:/A: format", () => {
    const result = parseQuizResponse("Just some random text without proper formatting.");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty text", () => {
    const result = parseQuizResponse("");
    expect(result).toHaveLength(0);
  });

  it("requires both question and answer to be non-empty", () => {
    const result = parseQuizResponse("Q:  \nA:  ");
    expect(result).toHaveLength(0);
  });
});
