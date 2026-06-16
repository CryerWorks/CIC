import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningStep } from "./PlanningStep";
import type { DailyLoop } from "../useDailyLoop";

function harness(overrides?: { id: string; title: string; status: "completed" | "active" | "locked" }[]) {
  const loop = {
    objective: "Epsilon-delta definition",
    courseTitle: "Real Analysis",
  } as unknown as DailyLoop;

  const sessions = overrides ?? [
    { id: "s1", title: "Limits intro", status: "completed" as const },
    { id: "s2", title: "Epsilon-delta definition", status: "active" as const },
    { id: "s3", title: "Continuity", status: "locked" as const },
  ];

  return <PlanningStep loop={loop} milestoneSessions={sessions} />;
}

describe("PlanningStep", () => {
  it("renders course title and objective", () => {
    render(harness());
    expect(screen.getByText("Real Analysis")).toBeTruthy();
  });

  it("shows completed session with ✅", () => {
    render(harness());
    expect(screen.getByText("✅")).toBeTruthy();
    expect(screen.getByText("Limits intro")).toBeTruthy();
  });

  it("shows active session with ▶", () => {
    render(harness());
    expect(screen.getByText("▶")).toBeTruthy();
    expect(screen.getByText("Epsilon-delta definition")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
  });

  it("shows locked session with 🔒", () => {
    render(harness());
    expect(screen.getByText("🔒")).toBeTruthy();
    expect(screen.getByText("Continuity")).toBeTruthy();
  });

  it("shows minimal layout when no milestone sessions provided", () => {
    render(<PlanningStep loop={{ objective: "Test", courseTitle: "Course" } as unknown as DailyLoop} />);
    expect(screen.getByText(/Ready to study/)).toBeTruthy();
  });
});
