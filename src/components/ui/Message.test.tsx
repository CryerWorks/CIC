import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Message } from "./Message";

describe("Message", () => {
  it("renders an AI avatar for the ai role", () => {
    render(<Message role="ai" author="Tutor">grounded answer</Message>);
    expect(screen.getByText("AI")).toBeTruthy();
    expect(screen.getByText("grounded answer")).toBeTruthy();
  });

  it("renders the user initial for the user role", () => {
    render(<Message role="user" author="Jon">my question</Message>);
    expect(screen.getByText("J")).toBeTruthy();
  });
});
