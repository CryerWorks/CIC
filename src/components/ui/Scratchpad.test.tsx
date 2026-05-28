import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Scratchpad } from "./Scratchpad";

describe("Scratchpad", () => {
  it("renders a labelled native textarea", () => {
    render(<Scratchpad id="sp" label="Scratch" placeholder="type..." />);
    const ta = screen.getByLabelText("Scratch");
    expect(ta.tagName).toBe("TEXTAREA");
  });
});
