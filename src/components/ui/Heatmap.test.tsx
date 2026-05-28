import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Heatmap } from "./Heatmap";

describe("Heatmap", () => {
  it("renders a cell per data point plus the label", () => {
    const { container } = render(<Heatmap data={[[0, 1], [2, 3]]} label="Activity" />);
    expect(screen.getByText("Activity")).toBeTruthy();
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
  });
});
