import { z } from "zod";

/** A single app-state key-value pair (Feature 006). Local app configuration — e.g. the
 *  configured vault folder under `vault.path` — kept in SQLite, separate from vault content. */
export const SettingSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type Setting = z.infer<typeof SettingSchema>;
