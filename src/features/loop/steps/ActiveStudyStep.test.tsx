import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveStudyStep } from "./ActiveStudyStep";
import type { DailyLoop, AssignmentView } from "../useDailyLoop";
import type { Resource, ResourceKind } from "../../../db";

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

function harness(assignments: AssignmentView[], open: (t: string | null) => Promise<{ opened: boolean }>) {
  const loop = { assignments } as unknown as DailyLoop;
  return <ActiveStudyStep loop={loop} open={open} />;
}

describe("ActiveStudyStep (US3) — opens the pre-assigned sources", () => {
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
    render(harness([{ resourceId: BOOK.id, resource: BOOK, locator: "ch. 3", kind: "read" }], () => Promise.resolve({ opened: false })));

    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    expect(screen.getByText("ch. 3")).toBeTruthy();
  });

  it("renders an empty-state when nothing was planned", () => {
    render(harness([], () => Promise.resolve({ opened: false })));
    expect(screen.getByText(/No assignments were planned/i)).toBeTruthy();
  });
});
