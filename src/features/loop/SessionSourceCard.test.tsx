import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionSourceCard } from "./SessionSourceCard";
import type { SessionSourceRow } from "../../db";

const BASE_SOURCE: SessionSourceRow = {
  id: "src-1",
  session_id: "sess-1",
  resource_id: null,
  title: "Baby Rudin ch. 1",
  url: "https://example.com/rudin.pdf",
  type: "reading",
  estimated_minutes: 30,
  ordering: 0,
  thumbnail_url: "",
  start_page: 12,
  end_page: 34,
  start_seconds: null,
  end_seconds: null,
  description: "Introduction to real numbers",
  completed: false,
};

describe("SessionSourceCard", () => {
  it("renders title and type badge", () => {
    render(<SessionSourceCard source={BASE_SOURCE} onToggleDone={() => {}} />);
    expect(screen.getByText("Baby Rudin ch. 1")).toBeTruthy();
    expect(screen.getByText("📄 Reading")).toBeTruthy();
  });

  it("shows page range when both bounds are set", () => {
    render(<SessionSourceCard source={BASE_SOURCE} onToggleDone={() => {}} />);
    expect(screen.getByText(/pp\. 12–34/)).toBeTruthy();
  });

  it("shows single page when only start_page is set", () => {
    const s = { ...BASE_SOURCE, end_page: null };
    render(<SessionSourceCard source={s} onToggleDone={() => {}} />);
    expect(screen.getByText(/p\. 12/)).toBeTruthy();
  });

  it("shows timestamp for watching sources", () => {
    const s: SessionSourceRow = {
      ...BASE_SOURCE,
      type: "watching",
      start_page: null,
      end_page: null,
      start_seconds: 30,
      end_seconds: 300,
      url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    };
    render(<SessionSourceCard source={s} onToggleDone={() => {}} />);
    expect(screen.getByText(/0:30–5:00/)).toBeTruthy();
  });

  it("renders YouTube thumbnail URL", () => {
    const s: SessionSourceRow = {
      ...BASE_SOURCE,
      url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    };
    const { container } = render(<SessionSourceCard source={s} onToggleDone={() => {}} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg",
    );
  });

  it("falls back to emoji when favicon fails to load", async () => {
    const s: SessionSourceRow = {
      ...BASE_SOURCE,
      url: "https://unknown.example/article",
    };
    const { container } = render(<SessionSourceCard source={s} onToggleDone={() => {}} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://unknown.example/favicon.ico");
  });

  it("calls onToggleDone when checkbox is clicked", async () => {
    const onToggle = vi.fn();
    render(<SessionSourceCard source={BASE_SOURCE} onToggleDone={onToggle} />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows 'Done' label when completed", () => {
    const s = { ...BASE_SOURCE, completed: true };
    render(<SessionSourceCard source={s} onToggleDone={() => {}} />);
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("renders description when present", () => {
    render(<SessionSourceCard source={BASE_SOURCE} onToggleDone={() => {}} />);
    expect(screen.getByText("Introduction to real numbers")).toBeTruthy();
  });

  it("renders Open button that opens URL in new window", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<SessionSourceCard source={BASE_SOURCE} onToggleDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/rudin.pdf",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });
});
