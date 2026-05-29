import { createContext, useContext, type ReactNode } from "react";
import { tauriSourceFiles, type SourceFiles } from "./sourceFiles";

/**
 * Provides the `SourceFiles` implementation to the Resources surface (Feature 011). Defaults to the
 * Tauri-backed impl at the app composition root; tests inject a fake so the dialog + native copy
 * never run under jsdom (mirrors the VaultProvider seam DI).
 */
const SourceFilesContext = createContext<SourceFiles>(tauriSourceFiles);

export function SourceFilesProvider({
  children,
  sourceFiles = tauriSourceFiles,
}: {
  children: ReactNode;
  sourceFiles?: SourceFiles;
}) {
  return <SourceFilesContext.Provider value={sourceFiles}>{children}</SourceFilesContext.Provider>;
}

export function useSourceFiles(): SourceFiles {
  return useContext(SourceFilesContext);
}
