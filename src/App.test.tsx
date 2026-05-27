import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Feature 002: App's root view is now the design-system StyleGuide (was the 001 placeholder).
describe("App", () => {
  it("renders the design-system style guide", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: /design system/i })).toBeTruthy();
  });
});
