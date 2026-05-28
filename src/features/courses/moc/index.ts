/**
 * Public surface of the pure MOC document module. The sole owner of the marker contract; the
 * sync layer composes these with the vault reader/writer + db repos. Pure + I/O-free — nothing
 * here imports React, the vault, or the db runtime (only the `MilestoneStatus` enum type).
 */

export { buildFrontmatter, renderMocBody, renderSection, markerBlock } from "./render";
export { mergeMocBody } from "./merge";
export { parseMocBody, sliceInner } from "./parse";
export { renderMilestoneLine, parseMilestoneLine } from "./milestoneLine";
export { mocRelPathFor } from "./filename";
export { MocCourseFrontmatterSchema, type MocCourseFrontmatter } from "./frontmatter";
export {
  SECTION_ORDER,
  SECTION_HEADING,
  REFLECTIONS_HEADING,
  openMarker,
  closeMarker,
  type ManagedSection,
} from "./markers";
export {
  MocParseError,
  type MocModel,
  type MocMilestoneModel,
  type ParsedMoc,
  type ParsedMilestoneLine,
} from "./model";
