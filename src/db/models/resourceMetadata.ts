import { z } from "zod";
import type { ResourceKind } from "./enums";

/**
 * Per-kind metadata shapes for a Resource (R13). `resources.metadata` is a JSON object whose
 * fields depend on the row's `kind`; validated against the matching schema on write. `.strict()`
 * rejects unknown keys so the registry never stores garbage (Constitution: validate all input).
 * `file_path`/`url` stay first-class columns (used to build opener targets) — only the extras
 * live here.
 */
const bookMeta = z.object({ author: z.string().optional(), isbn: z.string().optional() }).strict();
const docMeta = z.object({ author: z.string().optional(), pages: z.coerce.number().int().nonnegative().optional() }).strict();
const mediaMeta = z.object({ durationSec: z.coerce.number().int().nonnegative().optional() }).strict();
const videoUrlMeta = z.object({ channel: z.string().optional() }).strict();
const webMeta = z.object({ site: z.string().optional() }).strict();

const SCHEMAS: Record<ResourceKind, z.ZodTypeAny> = {
  book: bookMeta,
  pdf: docMeta,
  epub: docMeta,
  markdown: docMeta,
  video_file: mediaMeta,
  audio: mediaMeta,
  video_url: videoUrlMeta,
  web_page: webMeta,
};

/** The validation schema for a given kind's `metadata`. */
export function metadataSchemaFor(kind: ResourceKind): z.ZodTypeAny {
  return SCHEMAS[kind];
}

export type ResourceMetadata =
  | z.infer<typeof bookMeta>
  | z.infer<typeof docMeta>
  | z.infer<typeof mediaMeta>
  | z.infer<typeof videoUrlMeta>
  | z.infer<typeof webMeta>;
