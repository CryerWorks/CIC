import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Callout } from "./Callout";

describe("Callout", () => {
  it("renders the title and body for the ai variant", () => {
    render(<Callout variant="ai" title="AI note">generated content</Callout>);
    expect(screen.getByText("AI note")).toBeTruthy();
    expect(screen.getByText("generated content")).toBeTruthy();
  });
});
