import "./polyfills";
import "./styles/fonts";
import "./styles/theme.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { DbProvider } from "./app/providers/DbProvider";
import { VaultProvider } from "./app/providers/VaultProvider";
import { SourceFilesProvider } from "./features/resources/SourceFilesProvider";
import { NotifierProvider } from "./notifications/NotifierProvider";
import { ReminderScheduler } from "./features/notifications/ReminderScheduler";
import { AppRoutes } from "./app/router";

// DbProvider owns the SQLite store lifecycle (loading/error/ready). VaultProvider sits under it
// (it reads/writes the vault path via the store) and holds the single active-vault handle for
// the route tree (Feature 006). Both wrap the router so the AppShell gate + the Vault screen can
// surface their state.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DbProvider>
      <VaultProvider>
        <SourceFilesProvider>
          <NotifierProvider>
            <ReminderScheduler />
            <HashRouter>
              <AppRoutes />
            </HashRouter>
          </NotifierProvider>
        </SourceFilesProvider>
      </VaultProvider>
    </DbProvider>
  </React.StrictMode>,
);
