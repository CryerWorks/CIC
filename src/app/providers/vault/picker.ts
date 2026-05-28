import { open } from "@tauri-apps/plugin-dialog";

/** Open a folder chooser; resolves to the chosen absolute path, or `null` on cancel. */
export type FolderPicker = () => Promise<string | null>;

/**
 * Production `FolderPicker` over the native OS folder chooser (`@tauri-apps/plugin-dialog`).
 * The sole importer of the dialog plugin; everything else depends on the `FolderPicker` seam so
 * the provider is testable without Tauri.
 */
export const defaultPicker: FolderPicker = async () => {
  const result = await open({
    directory: true,
    multiple: false,
    title: "Choose your Obsidian vault",
  });
  return typeof result === "string" ? result : null;
};
