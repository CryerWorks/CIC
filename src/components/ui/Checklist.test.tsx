import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checklist } from "./Checklist";

const items = [
  { id: "a", label: "Alpha", done: true },
  { id: "b", label: "Beta" },
];

describe("Checklist", () => {
  it("renders a native checkbox per item and emits onToggle with the id", () => {
    const onToggle = vi.fn();
    render(<Checklist items={items} onToggle={onToggle} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    fireEvent.click(boxes[1]);
    expect(onToggle).toHaveBeenCalledWith("b");
  });
});
