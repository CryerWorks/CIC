import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("shows the question on the front face", () => {
    render(<Card question="Define a limit" hint="recall" />);
    expect(screen.getByText("Define a limit")).toBeTruthy();
  });

  it("shows the answer on the back face (no reveal logic — face is controlled)", () => {
    render(<Card question="Q" answer="A" face="back" />);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.queryByText("Q")).toBeNull();
  });
});
