import { describe, it, expect } from "vitest";
import { contrastRatio } from "./contrast";

// Dark-theme token values (mirror src/styles/theme.css @theme). This test guards the
// *values*: if a token changes and breaks WCAG AA, the build fails (SC-003 / FR-007).
const surface = "#1a1a1a";
const text = "#dadada";
const textDim = "#9a9a9a";
const textFaintAa = "#8a8a8a";
const textFaint = "#666666";
const accents = {
  brand: "#8b6cef",
  ai: "#00bfbc",
  success: "#44cf6e",
  warn: "#e0a72e",
  danger: "#fb464c",
  info: "#4c8dff",
};

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

describe("WCAG AA contrast on the charcoal surface", () => {
  it("primary, dim, and faint-aa text pass AA for normal-size text", () => {
    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(textDim, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(textFaintAa, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("brand + AI + semantic accents pass at least the large/UI threshold", () => {
    for (const [name, hex] of Object.entries(accents)) {
      expect(contrastRatio(hex, surface), name).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it("text-faint (#666) only meets large/UI — hence it is constrained (research R5)", () => {
    const ratio = contrastRatio(textFaint, surface);
    expect(ratio).toBeGreaterThanOrEqual(AA_LARGE);
    expect(ratio).toBeLessThan(AA_NORMAL);
  });
});
