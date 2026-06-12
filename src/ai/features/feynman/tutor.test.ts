// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { FeynmanTutorImpl } from "./tutorImpl";
import type { FeynmanGap } from "./types";

/** Build a mock router that yields `{ delta: char }` for each character of the response text. */
function mockRouter(responses: string[] = []) {
  let callCount = 0;
  return {
    chat: vi.fn(async function* () {
      const text = responses[callCount++] ?? "How does that relate to what you learned before?";
      for (const char of text) {
        yield { delta: char };
      }
    }),
  };
}

/** Build a mock router that throws on the first call (for error-path tests). */
function errorRouter() {
  return {
    chat: vi.fn(() => {
      throw new Error("AI offline");
    }),
  };
}

/** Build a mock router that starts streaming then throws mid-stream (for mid-stream error tests). */
function midStreamErrorRouter() {
  return {
    chat: vi.fn(async function* () {
      yield { delta: "Starting response..." };
      throw new Error("Provider error");
    }),
  };
}

function fakeSearch() {
  return vi.fn(async () => [
    {
      chunk: {
        sourceTitle: "Calculus Textbook",
        textContent: "The chain rule states...",
        headingPath: "Chapter 3",
        sourceKind: "resource",
        sourceId: "r1",
      },
      distance: 0.1,
      resourceId: "r1",
      locator: "Chapter 3",
    },
  ]);
}

function fakeGapWriter() {
  return { writeGaps: vi.fn(async () => {}) };
}

function fakeGapStore() {
  return { insertGaps: vi.fn(async () => {}) };
}

function makeTutor(opts: { router?: ReturnType<typeof mockRouter>; search?: ReturnType<typeof fakeSearch> } = {}) {
  return new FeynmanTutorImpl(
    opts.router ?? mockRouter(["Good question about calculus."]),
    opts.search ?? fakeSearch(),
    "v1",
    fakeGapWriter(),
    fakeGapStore(),
  );
}

describe("FeynmanTutorImpl", () => {
  it("starts a conversation with empty messages", () => {
    const tutor = makeTutor();
    tutor.startConversation();
    expect(tutor.getMessages()).toHaveLength(0);
  });

  it("sends a message and receives a streaming response", async () => {
    const tutor = makeTutor();
    tutor.startConversation();
    const chunks: string[] = [];
    for await (const chunk of tutor.sendMessage("Explain the chain rule")) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(tutor.getMessages()).toHaveLength(2);
    expect(tutor.getMessages()[0].role).toBe("learner");
    expect(tutor.getMessages()[1].role).toBe("tutor");
    expect(tutor.getMessages()[1].content.length).toBeGreaterThan(0);
  });

  it("calls RAG search before sending to the AI", async () => {
    const search = fakeSearch();
    const tutor = makeTutor({ search });
    tutor.startConversation();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of tutor.sendMessage("Chain rule")) { /* consume stream */ }
    expect(search).toHaveBeenCalledWith("Chain rule", 5);
  });

  it("continues conversation without error when RAG search fails", async () => {
    const search = vi.fn(async () => { throw new Error("RAG offline"); });
    const router = mockRouter(["What makes you say that?"]);
    const tutor = new FeynmanTutorImpl(router, search, "v1", fakeGapWriter(), fakeGapStore());
    tutor.startConversation();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of tutor.sendMessage("Test")) { /* consume stream */ }
    expect(tutor.getMessages()).toHaveLength(2);
  });

  it("preserves conversation history across multiple turns", async () => {
    const router = mockRouter(["First question.", "Second question."]);
    const tutor = makeTutor({ router });
    tutor.startConversation();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of tutor.sendMessage("Turn 1")) { /* consume */ }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of tutor.sendMessage("Turn 2")) { /* consume */ }
    expect(tutor.getMessages()).toHaveLength(4);
  });

  it("summarizes gaps from conversation", async () => {
    const router = mockRouter(["Ok, let's explore that.", "- Gap 1: needs to understand X\n- Gap 2: clarify Y"]);
    const tutor = makeTutor({ router });
    tutor.startConversation();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of tutor.sendMessage("Test")) { /* consume */ }
    const gaps = await tutor.summarizeGaps();
    expect(gaps).toHaveLength(2);
    expect(gaps[0].text).toContain("needs to understand X");
  });

  it("returns empty gaps on summarization error", async () => {
    const tutor = makeTutor({ router: errorRouter() as unknown as ReturnType<typeof mockRouter> });
    tutor.startConversation();
    const gaps = await tutor.summarizeGaps();
    expect(gaps).toHaveLength(0);
  });

  it("stops streaming on AI error and adds error message", async () => {
    const tutor = makeTutor({ router: midStreamErrorRouter() as unknown as ReturnType<typeof mockRouter> });
    tutor.startConversation();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of tutor.sendMessage("Test")) { /* consume stream */ }
    expect(tutor.getMessages().length).toBeGreaterThan(0);
    expect(tutor.isActive).toBe(false);
  });

  it("saves gaps via dual write (vault then DB)", async () => {
    const writer = fakeGapWriter();
    const store = fakeGapStore();
    const tutor = new FeynmanTutorImpl(mockRouter([]), fakeSearch(), "v1", writer, store);
    tutor.startConversation();
    const gaps: FeynmanGap[] = [{ text: "Missing understanding of X" }];
    const count = await tutor.saveGaps(gaps, { type: "session-writeup", notePath: "session.md", courseId: "c1" });
    expect(count).toBe(1);
    expect(writer.writeGaps).toHaveBeenCalledWith(gaps, { type: "session-writeup", notePath: "session.md", courseId: "c1" });
    expect(store.insertGaps).toHaveBeenCalled();
  });

  it("persists gaps to DB even when vault write fails", async () => {
    const writer = { writeGaps: vi.fn(async () => { throw new Error("Vault locked"); }) };
    const store = fakeGapStore();
    const tutor = new FeynmanTutorImpl(mockRouter([]), fakeSearch(), "v1", writer, store);
    tutor.startConversation();
    const count = await tutor.saveGaps([{ text: "Gap X" }], { type: "session-writeup", notePath: "s.md" });
    expect(count).toBe(1);
    expect(store.insertGaps).toHaveBeenCalled();
  });

  it("resets conversation on startConversation", async () => {
    const tutor = makeTutor();
    tutor.startConversation();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of tutor.sendMessage("First")) { /* consume */ }
    tutor.startConversation();
    expect(tutor.getMessages()).toHaveLength(0);
  });
});
