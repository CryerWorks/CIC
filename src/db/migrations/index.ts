import type { Migration } from "../migrate";
import { m0001Initial } from "./m0001_initial";
import { m0002Settings } from "./m0002_settings";
import { m0003Vaults } from "./m0003_vaults";

/**
 * Ordered migration registry — the single linear history the runner applies. Append new
 * migrations (in version order) here; never reorder or edit a shipped entry.
 */
export const migrations: Migration[] = [m0001Initial, m0002Settings, m0003Vaults];
