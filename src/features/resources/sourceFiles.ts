import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { ResourceKind } from "../../db";

/**
 * Tauri-facing operations for internalized source files (Feature 011). The ONLY module that imports
 * the native dialog + `invoke` for this feature; the hook/components depend on this seam so they
 * stay testable without Tauri (mirrors `FolderPicker`/`VaultConnector`). The deep impl is the pair
 * of custom Rust commands in `src-tauri/src/lib.rs`.
 */
export interface SourceFiles {
  /** Open the native chooser filtered for `kind`. Resolves to the chosen absolute path, or null on cancel. */
  pickFile(kind: ResourceKind): Promise<string | null>;
  /** Copy `sourcePath` into the app store for `resourceId` (failure-safe replace), returning the
   *  internalized absolute path to record in `resources.file_path`. Rejects if the copy fails. */
  importFile(input: { sourcePath: string; resourceId: string; filename: string }): Promise<string>;
  /** Remove the app-store folder for `resourceId`. No-op if absent. */
  removeFiles(resourceId: string): Promise<void>;
}

/** Native chooser extension filters per file-kind (R7). URL-kinds never call `pickFile`. */
const FILTERS: Partial<Record<ResourceKind, { name: string; extensions: string[] }>> = {
  pdf: { name: "PDF", extensions: ["pdf"] },
  epub: { name: "EPUB", extensions: ["epub"] },
  markdown: { name: "Markdown", extensions: ["md", "markdown"] },
  video_file: { name: "Video", extensions: ["mp4", "mkv", "mov", "webm", "avi"] },
  audio: { name: "Audio", extensions: ["mp3", "m4a", "wav", "flac", "ogg"] },
};

/** Resource kinds backed by an internalized file (vs. URL-kinds, which carry a link). */
export const FILE_KINDS: ResourceKind[] = ["pdf", "epub", "markdown", "video_file", "audio"];
export const URL_KINDS: ResourceKind[] = ["video_url", "web_page"];
export const isFileKind = (kind: ResourceKind): boolean => FILE_KINDS.includes(kind);

/** Cross-platform basename (handles both `/` and `\` separators). */
export const basename = (p: string): string => p.split(/[/\\]/).pop() ?? p;

/** Production impl over the native dialog (`@tauri-apps/plugin-dialog`) + the custom Rust commands. */
export const tauriSourceFiles: SourceFiles = {
  async pickFile(kind) {
    const filter = FILTERS[kind];
    const result = await open({
      multiple: false,
      directory: false,
      title: "Choose a source file",
      filters: filter ? [filter] : undefined,
    });
    return typeof result === "string" ? result : null;
  },
  importFile({ sourcePath, resourceId, filename }) {
    return invoke<string>("import_resource_file", { sourcePath, resourceId, filename });
  },
  removeFiles(resourceId) {
    return invoke<void>("remove_resource_files", { resourceId });
  },
};
