import "./polyfills";
import "./styles/fonts";
import "./styles/theme.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { DbProvider } from "./app/providers/DbProvider";
import { VaultProvider } from "./app/providers/VaultProvider";
import { AIProvider } from "./app/providers/AIProvider";
import { SourceFilesProvider } from "./features/resources/SourceFilesProvider";
import { NotifierProvider } from "./notifications/NotifierProvider";
import { ReminderScheduler } from "./features/notifications/ReminderScheduler";
import { AppRoutes } from "./app/router";

// DbProvider owns the SQLite store lifecycle (loading/error/ready). VaultProvider sits under it
// (it reads/writes the vault path via the store) and holds the single active-vault handle for
// the route tree (Feature 006). AIProvider (Feature 016) sits under DbProvider — it loads AIConfig
// from the `settings` table on mount and exposes the AIRouter via `useAIRouter()`. Both wrap the
// router so the AppShell gate + the Vault/Settings screens can surface their state.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DbProvider>
      <AIProvider>
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
      </AIProvider>
    </DbProvider>
  </React.StrictMode>,
);
