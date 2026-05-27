import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest globals are disabled (tests import their helpers explicitly), so Testing
// Library's automatic afterEach(cleanup) is never registered. Register it here so each
// test starts from a fresh DOM instead of accumulating prior renders.
afterEach(() => {
  cleanup();
});
