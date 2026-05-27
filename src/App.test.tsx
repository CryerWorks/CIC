import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Feature 001 smoke test (research R6): the one test that proves the harness works
// and that the App component renders its placeholder marker. getByText throws if the
// text is absent, so a passing render + assertion is the rendering proof (FR-002).
describe("App", () => {
  it("renders the CIC placeholder marker", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "CIC" })).toBeTruthy();
    expect(screen.getByText(/desktop shell is running/i)).toBeTruthy();
  });
});
