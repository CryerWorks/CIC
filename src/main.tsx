import "./styles/fonts";
import "./styles/theme.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initDatabase } from "./db/bootstrap";

// Create + migrate the local SQLite store on startup. Fire-and-forget so it never blocks the
// first paint; the data layer has no UI consumer yet. Failures are surfaced (logged), not
// swallowed. Under `npm run dev` (no Tauri runtime) this rejects and logs — expected; the
// store only exists under `npm run tauri dev`.
initDatabase().catch((err: unknown) => {
  console.error("[CIC] Database initialization failed:", err);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
