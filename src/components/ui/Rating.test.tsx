import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Rating } from "./Rating";

describe("Rating", () => {
  it("renders four native buttons and emits the chosen value (no scheduling)", () => {
    const onRate = vi.fn();
    render(<Rating onRate={onRate} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    expect(onRate).toHaveBeenCalledWith("good");
  });
});
