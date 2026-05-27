import { afterEach } from "vitest";

// Two test environments share this setup file:
//   • Component tests run in jsdom and need Testing Library's afterEach(cleanup) (Vitest
//     globals are disabled, so it isn't auto-registered).
//   • Data-layer tests run in the node environment (`// @vitest-environment node`) where
//     there is no DOM.
// Guard on `document` and import Testing Library lazily so this file is safe in both — the
// node-env db tests never load the React DOM helpers at all.
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
