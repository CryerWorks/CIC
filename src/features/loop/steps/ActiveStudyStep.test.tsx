import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveStudyStep } from "./ActiveStudyStep";
import type { DailyLoop, AssignmentView } from "../useDailyLoop";
import type { Resource, ResourceKind, SessionSourceRow } from "../../../db";

function res(id: string, kind: ResourceKind, over: Partial<Resource> = {}): Resource {
  return {
    id,
    vault_id: "v",
    domain_id: null,
    title: id,
    kind,
    file_path: null,
    url: null,
    metadata: {},
    ingested_at: null,
    added_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const PDF = res("Baby Rudin", "pdf", { file_path: "/store/x.pdf" });
const BOOK = res("Some Book", "book");

function harness(
  assignments: AssignmentView[],
  open: (t: string | null) => Promise<{ opened: boolean }>,
) {
  const loop = { assignments } as unknown as DailyLoop;
  return <ActiveStudyStep loop={loop} open={open} />;
}

function sourceHarness(
  sources: SessionSourceRow[],
  onToggle?: (id: string) => void,
) {
  const loop = { assignments: [] } as unknown as DailyLoop;
  return (
    <ActiveStudyStep
      loop={loop}
      sessionSources={sources}
      onToggleSourceDone={onToggle}
    />
  );
}

describe("ActiveStudyStep (US3) — legacy assignment mode", () => {
  it("opens a PDF assignment at its locator", async () => {
    const opened: (string | null)[] = [];
    render(
      harness([{ resourceId: PDF.id, resource: PDF, locator: "page=10", kind: "read" }], (t) => {
        opened.push(t);
        return Promise.resolve({ opened: true });
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Open" }));
    expect(opened).toEqual(["file:///store/x.pdf#page=10"]);
  });

  it("shows the locator as text for a non-openable kind (no Open button)", () => {
    render(
      harness(
        [{ resourceId: BOOK.id, resource: BOOK, locator: "ch. 3", kind: "read" }],
        () => Promise.resolve({ opened: false }),
      ),
    );

    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    expect(screen.getByText("ch. 3")).toBeTruthy();
  });

  it("renders an empty-state when nothing was planned", () => {
    render(harness([], () => Promise.resolve({ opened: false })));
    expect(screen.getByText(/No assignments were planned/i)).toBeTruthy();
  });
});

describe("ActiveStudyStep — session source card mode", () => {
  const sources: SessionSourceRow[] = [
    {
      id: "s1",
      session_id: "sess-1",
      resource_id: null,
      title: "Source One",
      url: "https://example.com/one",
      type: "reading",
      estimated_minutes: 20,
      ordering: 0,
      thumbnail_url: "",
      start_page: null,
      end_page: null,
      start_seconds: null,
      end_seconds: null,
      description: "",
      completed: false,
    },
    {
      id: "s2",
      session_id: "sess-1",
      resource_id: null,
      title: "Source Two",
      url: "https://example.com/two",
      type: "watching",
      estimated_minutes: 15,
      ordering: 1,
      thumbnail_url: "",
      start_page: null,
      end_page: null,
      start_seconds: null,
      end_seconds: null,
      description: "",
      completed: false,
    },
  ];

  it("renders source cards and progress", () => {
    render(sourceHarness(sources));
    expect(screen.getByText("Source One")).toBeTruthy();
    expect(screen.getByText("Source Two")).toBeTruthy();
    expect(screen.getByText(/0 of 2 sources completed/)).toBeTruthy();
  });

  it("shows all-done badge when all completed", () => {
    const done = sources.map((s) => ({ ...s, completed: true }));
    render(sourceHarness(done));
    expect(screen.getByText(/2 of 2 sources completed/)).toBeTruthy();
    expect(screen.getByText(/All sources done/)).toBeTruthy();
  });

  it("calls onToggleSourceDone when checkbox is toggled", async () => {
    const onToggle = vi.fn();
    render(sourceHarness(sources, onToggle));
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[0]);
    expect(onToggle).toHaveBeenCalledWith("s1");
  });

  it("shows feynman gate hint when not all done", () => {
    render(sourceHarness(sources));
    expect(screen.getByText(/finish all to unlock Feynman/)).toBeTruthy();
  });
});
