import type { Migration } from "../migrate";
import { m0001Initial } from "./m0001_initial";
import { m0002Settings } from "./m0002_settings";
import { m0003Vaults } from "./m0003_vaults";
import { m0004SrsScoping } from "./m0004_srs_scoping";
import { m0005ResourceDomain } from "./m0005_resource_domain";
import { m0006SessionLifecycle } from "./m0006_session_lifecycle";
import { m0007SessionCurriculum } from "./m0007_session_curriculum";
import { m0008ProjectAuthoring } from "./m0008_project_authoring";

/**
 * Ordered migration registry — the single linear history the runner applies. Append new
 * migrations (in version order) here; never reorder or edit a shipped entry.
 */
export const migrations: Migration[] = [
  m0001Initial,
  m0002Settings,
  m0003Vaults,
  m0004SrsScoping,
  m0005ResourceDomain,
  m0006SessionLifecycle,
  m0007SessionCurriculum,
  m0008ProjectAuthoring,
];
