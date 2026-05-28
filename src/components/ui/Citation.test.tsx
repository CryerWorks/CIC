import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Citation } from "./Citation";

describe("Citation", () => {
  it("renders an anchor when href is provided", () => {
    render(<Citation source="Spivak" locator="p.42" href="#ref" />);
    expect(screen.getByRole("link")).toBeTruthy();
  });

  it("renders plain text (no link) without href", () => {
    render(<Citation source="Spivak" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Spivak")).toBeTruthy();
  });
});
