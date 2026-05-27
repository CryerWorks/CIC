import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Graph } from "./Graph";

describe("Graph", () => {
  it("renders an accessible svg with node labels", () => {
    render(
      <Graph
        nodes={[
          { id: "n1", label: "Calc", x: 40, y: 40, domain: 1 },
          { id: "n2", label: "Algebra", x: 160, y: 80, domain: 2 },
        ]}
        edges={[{ from: "n1", to: "n2" }]}
      />,
    );
    expect(screen.getByRole("img", { name: /dependency graph/i })).toBeTruthy();
    expect(screen.getByText("Calc")).toBeTruthy();
  });
});
