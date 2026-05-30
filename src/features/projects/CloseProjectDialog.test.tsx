import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloseProjectDialog } from "./CloseProjectDialog";
import type { CloseFormInput } from "./useProjects";

function renderDialog() {
  const onConfirm = vi.fn<(input: CloseFormInput) => Promise<void>>().mockResolvedValue(undefined);
  render(<CloseProjectDialog title="Diagonalize a 3×3" resources={[]} onCancel={() => {}} onConfirm={onConfirm} />);
  return onConfirm;
}

describe("CloseProjectDialog (US2 / Constitution III)", () => {
  it("completes with only the cards the learner explicitly added", async () => {
    const onConfirm = renderDialog();

    await userEvent.type(screen.getByLabelText("Reflection"), "kept dropping the sign");
    await userEvent.type(screen.getByLabelText("Card front"), "Sign check?");
    await userEvent.type(screen.getByLabelText("Card back"), "normalize last");
    await userEvent.click(screen.getByRole("button", { name: "Add card" }));
    await userEvent.click(screen.getByRole("button", { name: "Complete project" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const input = onConfirm.mock.calls[0][0];
    expect(input.outcome).toBe("complete");
    expect(input.reflection).toBe("kept dropping the sign");
    expect(input.cards).toEqual([{ front: "Sign check?", back: "normalize last" }]);
  });

  it("closes with zero cards when none are added", async () => {
    const onConfirm = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Complete project" }));
    expect(onConfirm.mock.calls[0][0].cards).toEqual([]);
  });

  it("frames 'set aside' neutrally (never as failure)", async () => {
    const onConfirm = renderDialog();
    await userEvent.click(screen.getByRole("radio", { name: "Set aside" }));
    expect(screen.getByText(/it's not a failure/i)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Set aside" }));
    expect(onConfirm.mock.calls[0][0].outcome).toBe("abandoned");
  });
});
