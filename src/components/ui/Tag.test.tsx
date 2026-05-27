import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("renders its children", () => {
    render(<Tag tone="success">live</Tag>);
    expect(screen.getByText("live")).toBeTruthy();
  });
});
