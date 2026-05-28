import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCell } from "./StatCell";

describe("StatCell", () => {
  it("renders the label, value, and unit", () => {
    render(<StatCell label="Streak" value={12} unit="d" />);
    expect(screen.getByText("Streak")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("d")).toBeTruthy();
  });
});
