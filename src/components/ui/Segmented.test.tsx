import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Segmented, type SegOption } from "./Segmented";

const opts: SegOption[] = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
];

describe("Segmented", () => {
  it("renders a radiogroup with a radio per option", () => {
    render(<Segmented options={opts} value="a" onChange={vi.fn()} ariaLabel="mode" />);
    expect(screen.getByRole("radiogroup", { name: "mode" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("moves the selection with ArrowRight (keyboard operable)", () => {
    const onChange = vi.fn();
    render(<Segmented options={opts} value="a" onChange={onChange} ariaLabel="mode" />);
    fireEvent.keyDown(screen.getByRole("radio", { checked: true }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
