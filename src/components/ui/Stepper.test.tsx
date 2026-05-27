import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("renders an ordered list item per step", () => {
    render(<Stepper steps={[{ label: "Plan", state: "done" }, { label: "Build", state: "active" }]} />);
    expect(screen.getByText("Plan")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
