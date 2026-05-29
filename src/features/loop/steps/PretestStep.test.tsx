import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PretestStep } from "./PretestStep";
import type { DailyLoop, PretestAttempt } from "../useDailyLoop";

function Harness({ initial }: { initial: PretestAttempt[] }) {
  const [pretest, setPretest] = useState<PretestAttempt[]>(initial);
  const setPretestAnswer = (id: string, answer: string) =>
    setPretest((ps) => ps.map((p) => (p.id === id ? { ...p, answer } : p)));
  const loop = { pretest, setPretestAnswer } as unknown as DailyLoop;
  return <PretestStep loop={loop} />;
}

describe("PretestStep (US5) — attempt the planned questions", () => {
  it("captures an attempt per planned question with no grading", async () => {
    render(<Harness initial={[{ id: "q1", question: "What is a limit?", answer: "" }]} />);

    const input = screen.getByLabelText("Answer: What is a limit?");
    await userEvent.type(input, "a guess");
    expect((input as HTMLInputElement).value).toBe("a guess");

    // Errorful generation: no correct/incorrect or score anywhere (Constitution III).
    expect(screen.queryByText(/correct/i)).toBeNull();
    expect(screen.queryByText(/score/i)).toBeNull();
  });

  it("shows an empty-state when no pretest was planned", () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText(/No pretest questions were planned/i)).toBeTruthy();
  });
});
