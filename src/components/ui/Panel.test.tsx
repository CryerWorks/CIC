import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "./Panel";

describe("Panel", () => {
  it("renders title + children and honors the `as` element", () => {
    const { container } = render(<Panel title="Header" as="section">body</Panel>);
    expect(container.querySelector("section")).toBeTruthy();
    expect(screen.getByText("Header")).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });
});
