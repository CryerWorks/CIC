import { createContext, useContext, type ReactNode } from "react";
import type { Notifier } from "./notifier";
import { tauriNotifier } from "./adapters/tauri";

/**
 * Provides the `Notifier` implementation (Feature 014). Defaults to the Tauri-backed impl at the app
 * composition root; tests inject a fake so the native plugin never runs under jsdom (mirrors the
 * `SourceFilesProvider` / `VaultProvider` seam DI).
 */
const NotifierContext = createContext<Notifier>(tauriNotifier);

export function NotifierProvider({
  children,
  notifier = tauriNotifier,
}: {
  children: ReactNode;
  notifier?: Notifier;
}) {
  return <NotifierContext.Provider value={notifier}>{children}</NotifierContext.Provider>;
}

export function useNotifier(): Notifier {
  return useContext(NotifierContext);
}
