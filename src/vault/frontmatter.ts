/**
 * Frontmatter parse/serialize via gray-matter (research R2). The vault layer is generic — it
 * does not know Course/Project shapes; the *caller* supplies a zod schema and this module
 * validates against it (FR-002/003). gray-matter normalizes the body to end in a single trailing
 * newline (verified empirically) — the clean, Obsidian/POSIX-conventional form — so a body in
 * that canonical shape round-trips byte-faithfully (SC-001) and any body is idempotent on
 * re-write.
 */

import matter from "gray-matter";
import type { ZodType } from "zod";
import { FrontmatterParseError } from "./errors";

export interface ParsedNote {
  data: Record<string, unknown>;
  body: string;
}

/**
 * Split raw note text into frontmatter `data` + Markdown `body`. Throws `FrontmatterParseError`
 * on unparseable YAML — the rare hard failure; `VaultReader.readNoteAs` wraps this so callers
 * never crash (FR-002).
 */
export function parseNote(path: string, raw: string): ParsedNote {
  try {
    const file = matter(raw);
    return { data: file.data as Record<string, unknown>, body: file.content };
  } catch (err) {
    throw new FrontmatterParseError(
      path,
      `Unparseable frontmatter in ${path}: ${(err as Error).message}`,
    );
  }
}

/**
 * Validate already-parsed frontmatter against the caller's schema (FR-002). Returns the typed
 * value, or a `FrontmatterParseError` carrying the zod issues — never throws.
 */
export function validateFrontmatter<T>(
  path: string,
  data: Record<string, unknown>,
  schema: ZodType<T>,
): { ok: true; value: T } | { ok: false; error: FrontmatterParseError } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: new FrontmatterParseError(
      path,
      `Frontmatter failed schema validation in ${path}`,
      result.error,
    ),
  };
}

/**
 * Serialize frontmatter + body into clean, human-readable Markdown (FR-003). With empty
 * frontmatter, gray-matter omits the `---` fence and returns the body alone — exactly the clean
 * output a person would expect.
 */
export function serializeNote(frontmatter: Record<string, unknown>, body: string): string {
  return matter.stringify(body, frontmatter);
}
