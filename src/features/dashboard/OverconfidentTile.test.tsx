import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverconfidentTile } from "./OverconfidentTile";
import type { Card } from "../../db";

function card(front: string): Card {
  return {
    id: front,
    course_id: "c",
    project_id: null,
    note_path: null,
    note_block_id: null,
    front,
    back: "",
    fsrs_state: null,
    due_at: null,
    last_reviewed: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("OverconfidentTile (US3)", () => {
  it("lists the overconfident cards with a count", () => {
    render(<OverconfidentTile cards={[card("Tricky theorem"), card("Edge case")]} />);
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Tricky theorem")).toBeTruthy();
    expect(screen.getByText("Edge case")).toBeTruthy();
  });

  it("shows zero with no list when none are flagged (no fabricated data)", () => {
    render(<OverconfidentTile cards={[]} />);
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});
