// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateBlueprint, BlueprintValidationError, validatePartialBlueprint } from "./validator";

const validBlueprint = {
  title: "Real Analysis Fundamentals",
  domain: "Mathematics",
  target: {
    topic: "Real Analysis",
    scope: "course" as const,
    depth: "working" as const,
    domainName: "Mathematics",
  },
  milestones: [
    {
      order: 0,
      capability: "Define and prove limits using epsilon-delta",
      description: "Master epsilon-delta proofs",
      difficulty: 2,
    },
  ],
  cardSeeds: [
    { front: "What is a limit?", back: "The value a function approaches", milestoneIndex: 0 },
  ],
  retrievalQs: [
    { question: "How to prove a limit?", milestoneIndex: 0, answerSnippet: "Use epsilon-delta" },
  ],
  feynmanTargets: [
    { concept: "Intermediate Value Theorem", milestoneIndex: 0 },
  ],
  resourceMap: [],
};

describe("validateBlueprint", () => {
  it("accepts a valid blueprint", () => {
    const result = validateBlueprint(validBlueprint);
    expect(result.title).toBe("Real Analysis Fundamentals");
    expect(result.milestones).toHaveLength(1);
  });

  it("accepts blueprint with multiple milestones and cross-references", () => {
    const bp = {
      ...validBlueprint,
      milestones: [
        { order: 0, capability: "First milestone", description: "First desc", difficulty: 1 },
        { order: 1, capability: "Second milestone", description: "Second desc", difficulty: 3 },
      ],
      cardSeeds: [
        { front: "Card for first", back: "Answer for first", milestoneIndex: 0 },
        { front: "Card for second", back: "Answer for second", milestoneIndex: 1 },
      ],
      retrievalQs: [
        { question: "Q for first", milestoneIndex: 0, answerSnippet: "Ans" },
      ],
      feynmanTargets: [
        { concept: "Concept", milestoneIndex: 1 },
      ],
    };
    const result = validateBlueprint(bp);
    expect(result.milestones).toHaveLength(2);
    expect(result.cardSeeds).toHaveLength(2);
  });

  it("rejects blueprint with empty title", () => {
    expect(() =>
      validateBlueprint({ ...validBlueprint, title: "" }),
    ).toThrow(BlueprintValidationError);
  });

  it("rejects blueprint with no milestones", () => {
    expect(() =>
      validateBlueprint({ ...validBlueprint, milestones: [] }),
    ).toThrow(BlueprintValidationError);
  });

  it("rejects blueprint with milestone index out of range", () => {
    expect(() =>
      validateBlueprint({
        ...validBlueprint,
        cardSeeds: [{ front: "Bad card", back: "Bad answer", milestoneIndex: 5 }],
      }),
    ).toThrow(BlueprintValidationError);
  });

  it("rejects blueprint with retrieval Q index out of range", () => {
    expect(() =>
      validateBlueprint({
        ...validBlueprint,
        retrievalQs: [{ question: "Bad Q", milestoneIndex: 5, answerSnippet: "Ans" }],
      }),
    ).toThrow(BlueprintValidationError);
  });

  it("rejects blueprint with feynman target index out of range", () => {
    expect(() =>
      validateBlueprint({
        ...validBlueprint,
        feynmanTargets: [{ concept: "Bad", milestoneIndex: 5 }],
      }),
    ).toThrow(BlueprintValidationError);
  });

  it("rejects null input", () => {
    expect(() => validateBlueprint(null)).toThrow(BlueprintValidationError);
  });

  it("rejects non-object input", () => {
    expect(() => validateBlueprint("string")).toThrow(BlueprintValidationError);
  });

  it("rejects blueprint with invalid depth", () => {
    expect(() =>
      validateBlueprint({
        ...validBlueprint,
        target: { ...validBlueprint.target, depth: "expert" },
      }),
    ).toThrow(BlueprintValidationError);
  });

  it("rejects blueprint with difficulty out of range", () => {
    expect(() =>
      validateBlueprint({
        ...validBlueprint,
        milestones: [{ order: 0, capability: "C", description: "D", difficulty: 0 }],
      }),
    ).toThrow(BlueprintValidationError);
  });

  it("rejects blueprint with too many milestones", () => {
    const milestones = Array.from({ length: 21 }, (_, i) => ({
      order: i,
      capability: `Milestone ${i}`,
      description: `Desc ${i}`,
      difficulty: 2,
    }));
    expect(() =>
      validateBlueprint({ ...validBlueprint, milestones }),
    ).toThrow(BlueprintValidationError);
  });
});

describe("validatePartialBlueprint", () => {
  it("accepts empty partial", () => {
    const result = validatePartialBlueprint({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("validates title field", () => {
    const result = validatePartialBlueprint({ title: "New Title" });
    expect(result.title).toBe("New Title");
  });

  it("validates milestones field", () => {
    const result = validatePartialBlueprint({
      milestones: [{ order: 0, capability: "Test cap", description: "Desc", difficulty: 2 }],
    });
    expect(result.milestones).toHaveLength(1);
    expect(result.milestones![0].capability).toBe("Test cap");
  });

  it("skips invalid milestones silently", () => {
    const result = validatePartialBlueprint({
      milestones: [{ order: "bad" }],
    });
    expect(result.milestones).toBeUndefined();
  });

  it("validates domain field", () => {
    const result = validatePartialBlueprint({ domain: "Physics" });
    expect(result.domain).toBe("Physics");
  });
});
