import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Annotation } from "./Annotation";

describe("Annotation", () => {
  it("renders the label and body", () => {
    render(<Annotation label="Note">be careful here</Annotation>);
    expect(screen.getByText("Note:")).toBeTruthy();
    expect(screen.getByText(/be careful here/)).toBeTruthy();
  });
});
