// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FeynmanCitation } from "../../../src/features/feynman/FeynmanCitation";
import { FeynmanMessage } from "../../../src/features/feynman/FeynmanMessage";
import type { FeynmanMessage as FeynmanMessageType } from "../../../src/ai/features/feynman/types";

/* =========================================================================
 * T027: FeynmanCitation — clickable chip
 * ========================================================================= */

describe("FeynmanCitation", () => {
  it("renders the source name", () => {
    render(
      <FeynmanCitation sourceName="Baby Rudin" locator="page 42" />,
    );

    expect(screen.getByText("Baby Rudin")).toBeTruthy();
    expect(screen.getByText("· page 42")).toBeTruthy();
  });

  it("renders without a locator", () => {
    render(
      <FeynmanCitation sourceName="Baby Rudin" locator="" />,
    );

    expect(screen.getByText("Baby Rudin")).toBeTruthy();
    expect(screen.queryByText("·")).toBeNull();
  });

  it("calls the injected open function when clicked", () => {
    const open = vi.fn().mockResolvedValue({ opened: true });
    render(
      <FeynmanCitation sourceName="Baby Rudin" locator="page 42" open={open} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Baby Rudin/ }));

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("Baby Rudin — page 42");
  });

  it("handles click gracefully when open returns opened: false (FR-017)", () => {
    const open = vi.fn().mockResolvedValue({ opened: false });
    render(
      <FeynmanCitation sourceName="Missing File" locator="ch. 3" open={open} />,
    );

    // Must not throw
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });

  it("applies brand colour classes for link-like appearance", () => {
    render(
      <FeynmanCitation sourceName="Source" locator="loc" />,
    );

    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-brand");
    expect(btn.className).toContain("text-brand");
  });
});

/* =========================================================================
 * T028: Citation parsing in FeynmanMessage
 * ========================================================================= */

describe("FeynmanMessage — inline citation parsing", () => {
  it("renders [source: Name, locator] as clickable citation chips inline", () => {
    const msg: FeynmanMessageType = {
      role: "tutor",
      content: "According to [source: Baby Rudin, page 42], continuity is key.",
    };

    render(<FeynmanMessage message={msg} />);

    // Should render the citation chip
    expect(screen.getByText("Baby Rudin")).toBeTruthy();
    expect(screen.getByText("· page 42")).toBeTruthy();

    // Should render surrounding text
    expect(screen.getByText(/According to/)).toBeTruthy();
    expect(screen.getByText(/, continuity is key/)).toBeTruthy();
  });

  it("renders text without citation markers as normal text", () => {
    const msg: FeynmanMessageType = {
      role: "tutor",
      content: "What do you think a derivative represents?",
    };

    render(<FeynmanMessage message={msg} />);

    expect(screen.getByText(/What do you think/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders multiple citation chips from one message", () => {
    const msg: FeynmanMessageType = {
      role: "tutor",
      content:
        "In [source: Baby Rudin, page 42] and [source: Rasmussen, ch. 3], the concept is explored.",
    };

    render(<FeynmanMessage message={msg} />);

    expect(screen.getByText("Baby Rudin")).toBeTruthy();
    expect(screen.getByText("Rasmussen")).toBeTruthy();
  });

  it("renders learner messages without citation parsing issues", () => {
    const msg: FeynmanMessageType = {
      role: "learner",
      content: "I think [source: X, Y] is not a real citation here.",
    };

    render(<FeynmanMessage message={msg} />);

    // Learner messages should still parse (text is text), but the [source: ...] pattern
    // should be rendered as a citation chip since the parser is format-based
    expect(screen.getByText("X")).toBeTruthy();
  });

  it("still renders structured citations when provided on the message", () => {
    const msg: FeynmanMessageType = {
      role: "tutor",
      content: "What do you recall about limits?",
      citations: [
        { sourceName: "Baby Rudin", locator: "page 42", sourceKind: "resource", sourceId: "r1" },
      ],
    };

    render(<FeynmanMessage message={msg} />);

    // Structured citations rendered below the text
    expect(screen.getByText("Baby Rudin")).toBeTruthy();
  });
});

/* =========================================================================
 * T029: Uncertainty flag detection
 * ========================================================================= */

describe("FeynmanMessage — uncertainty flag", () => {
  it("shows uncertainty badge when tutor content contains the uncertainty prefix", () => {
    const msg: FeynmanMessageType = {
      role: "tutor",
      content: "⚠️ I'm reasoning from general knowledge — verify this against your sources.",
    };

    render(<FeynmanMessage message={msg} />);

    expect(screen.getByText(/Uncertain/)).toBeTruthy();
    expect(screen.getByText(/verify against your sources/)).toBeTruthy();
  });

  it("does not show uncertainty badge for learner messages even with the prefix", () => {
    const msg: FeynmanMessageType = {
      role: "learner",
      content: "⚠️ I'm reasoning from general knowledge — let me check",
    };

    render(<FeynmanMessage message={msg} />);

    expect(screen.queryByText(/Uncertain/)).toBeNull();
  });

  it("does not show uncertainty badge when prefix is absent", () => {
    const msg: FeynmanMessageType = {
      role: "tutor",
      content: "What does the chain rule state?",
    };

    render(<FeynmanMessage message={msg} />);

    expect(screen.queryByText(/Uncertain/)).toBeNull();
  });

  it("shows streaming cursor alongside uncertainty badge", () => {
    const msg: FeynmanMessageType = {
      role: "tutor",
      content: "⚠️ I'm reasoning from general knowledge — this is a guess",
      isStreaming: true,
    };

    render(<FeynmanMessage message={msg} />);

    expect(screen.getByText(/Uncertain/)).toBeTruthy();
    expect(screen.getByLabelText("typing")).toBeTruthy();
  });
});
