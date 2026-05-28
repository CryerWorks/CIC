import "./styles/fonts";
import "./styles/theme.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { DbProvider } from "./app/providers/DbProvider";
import { AppRoutes } from "./app/router";

// DbProvider owns the SQLite store lifecycle (loading/error/ready) and wraps the router so the
// AppShell gate can surface it. Routing is the app's entry view now (the StyleGuide moved to
// the /style route).
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DbProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </DbProvider>
  </React.StrictMode>,
);
