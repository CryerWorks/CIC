// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuizPanel } from "../../../src/features/quiz/QuizPanel";

// Mock the useQuiz hook
const mockGenerate = vi.fn();
const mockSubmitAnswer = vi.fn();
const mockSubmitRating = vi.fn();
const mockSpawnCards = vi.fn();
const mockReset = vi.fn();

let mockState: ReturnType<typeof createMockState>;

function createMockState(overrides: Record<string, unknown> = {}) {
  return {
    questions: [],
    currentIndex: 0,
    ratings: new Map(),
    learnerAnswers: new Map(),
    status: "idle",
    error: null,
    spawnResults: null,
    generate: mockGenerate,
    submitAnswer: mockSubmitAnswer,
    submitRating: mockSubmitRating,
    spawnCards: mockSpawnCards,
    reset: mockReset,
    ...overrides,
  };
}

vi.mock("../../../src/ai/features/quiz/hooks/useQuiz", () => ({
  useQuiz: () => mockState,
}));

const defaultProps = {
  topic: "Calculus",
  onClose: vi.fn(),
};

describe("QuizPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = createMockState();
  });

  it("renders idle state with start button", () => {
    render(<QuizPanel {...defaultProps} />);

    expect(screen.getByText("Retrieval Quiz")).toBeTruthy();
    expect(screen.getByText("Start Quiz")).toBeTruthy();
    expect(screen.getByText(/Calculus/)).toBeTruthy();
  });

  it("starts quiz generation on Start Quiz click", () => {
    render(<QuizPanel {...defaultProps} />);

    fireEvent.click(screen.getByText("Start Quiz"));

    expect(mockGenerate).toHaveBeenCalledWith("Calculus", { courseId: undefined, count: 5 });
  });

  it("shows generating state", () => {
    mockState = createMockState({ status: "generating" });
    render(<QuizPanel {...defaultProps} />);

    expect(screen.getByText("Generating quiz questions…")).toBeTruthy();
  });

  it("shows error state with retry button", () => {
    mockState = createMockState({ status: "error", error: "AI unavailable" });
    render(<QuizPanel {...defaultProps} />);

    expect(screen.getByText("AI unavailable")).toBeTruthy();
    expect(screen.getByText("Try Again")).toBeTruthy();
  });

  it("shows answering state with question card", () => {
    mockState = createMockState({
      status: "answering",
      questions: [{ question: "What is calculus?", answer: "The study of change." }],
      currentIndex: 0,
    });
    render(<QuizPanel {...defaultProps} />);

    expect(screen.getByText("What is calculus?")).toBeTruthy();
    expect(screen.getByText("Question 1 of 1")).toBeTruthy();
    expect(screen.getByLabelText(/Your answer/)).toBeTruthy();
    expect(screen.getByText("Submit Answer")).toBeTruthy();
  });

  it("submit answer transitions via hook", () => {
    mockState = createMockState({
      status: "answering",
      questions: [{ question: "Q1?", answer: "A1." }],
      currentIndex: 0,
    });
    render(<QuizPanel {...defaultProps} />);

    const textarea = screen.getByLabelText(/Your answer/);
    fireEvent.change(textarea, { target: { value: "My answer" } });
    fireEvent.click(screen.getByText("Submit Answer"));

    expect(mockSubmitAnswer).toHaveBeenCalledWith("My answer");
  });

  it("shows revealing state with self-rating buttons", () => {
    mockState = createMockState({
      status: "revealing",
      questions: [{ question: "Q1?", answer: "A1." }],
      currentIndex: 0,
      learnerAnswers: new Map([[0, "My answer"]]),
    });
    render(<QuizPanel {...defaultProps} />);

    expect(screen.getByText("Reference answer")).toBeTruthy();
    expect(screen.getByText("A1.")).toBeTruthy();
    expect(screen.getByText("Your answer")).toBeTruthy();
    expect(screen.getByText("My answer")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Got it/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Missed/ })).toBeTruthy();
  });

  it("rating calls submitRating", () => {
    mockState = createMockState({
      status: "revealing",
      questions: [{ question: "Q1?", answer: "A1." }],
      currentIndex: 0,
      learnerAnswers: new Map([[0, "My answer"]]),
    });
    render(<QuizPanel {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Got it/ }));

    expect(mockSubmitRating).toHaveBeenCalledWith("got-it");
  });

  it("shows summary state with stats", () => {
    mockState = createMockState({
      status: "summary",
      questions: [
        { question: "Q1?", answer: "A1." },
        { question: "Q2?", answer: "A2." },
      ],
      ratings: new Map([
        [0, "got-it"],
        [1, "missed"],
      ]),
      learnerAnswers: new Map([
        [0, "Correct answer"],
        [1, "Wrong answer"],
      ]),
    });
    render(<QuizPanel {...defaultProps} />);

    expect(screen.getByText("Quiz Complete")).toBeTruthy();
    expect(screen.getByText("Got it")).toBeTruthy();
    expect(screen.getByText("Missed")).toBeTruthy();
    // Should show spawn button for missed items
    expect(screen.getByText(/Create cards for 1 missed/)).toBeTruthy();
  });

  it("spawn cards button calls spawnCards", () => {
    mockState = createMockState({
      status: "summary",
      questions: [{ question: "Q1?", answer: "A1." }],
      ratings: new Map([[0, "missed"]]),
      learnerAnswers: new Map([[0, "Wrong"]]),
    });
    render(<QuizPanel {...defaultProps} />);

    fireEvent.click(screen.getByText(/Create cards for 1 missed/));

    expect(mockSpawnCards).toHaveBeenCalled();
  });

  it("displays spawn results after spawning", () => {
    mockState = createMockState({
      status: "summary",
      questions: [{ question: "Q1?", answer: "A1." }],
      ratings: new Map([[0, "missed"]]),
      learnerAnswers: new Map([[0, "Wrong"]]),
      spawnResults: [{ question: "Q1?", success: true, cardId: "card-123" }],
    });
    render(<QuizPanel {...defaultProps} />);

    expect(screen.getByText(/Created 1 card/)).toBeTruthy();
  });

  it("start a new quiz button calls reset and then generates", () => {
    mockState = createMockState({
      status: "summary",
      questions: [{ question: "Q1?", answer: "A1." }],
      ratings: new Map([[0, "got-it"]]),
      learnerAnswers: new Map([[0, "Answer"]]),
    });
    render(<QuizPanel {...defaultProps} />);

    fireEvent.click(screen.getByText("Start a new quiz"));

    expect(mockReset).toHaveBeenCalled();
  });

  it("close shows confirmation when quiz is in progress", () => {
    mockState = createMockState({
      status: "answering",
      questions: [{ question: "Q1?", answer: "A1." }],
      currentIndex: 0,
    });
    render(<QuizPanel {...defaultProps} />);

    fireEvent.click(screen.getByLabelText("Close quiz"));

    expect(screen.getByText("Close Quiz?")).toBeTruthy();
    expect(screen.getByText("Close anyway")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("close confirmation cancel button hides dialog", () => {
    mockState = createMockState({
      status: "answering",
      questions: [{ question: "Q1?", answer: "A1." }],
      currentIndex: 0,
    });
    render(<QuizPanel {...defaultProps} />);

    fireEvent.click(screen.getByLabelText("Close quiz"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Close Quiz?")).toBeNull();
  });
});
