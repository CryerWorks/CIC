import { z } from "zod";

/**
 * Read-path zod building blocks shared by entity models. Models describe the **decoded**
 * (domain) shape — booleans as `boolean`, JSON columns as parsed objects — while the input
 * they parse is the **raw SQLite row** (integers 0/1, JSON-as-text). The write path encodes
 * the inverse in `repositories/query.ts` (`encodeValue`).
 */

/** SQLite has no boolean type — columns are INTEGER 0/1. Decode to a real boolean on read. */
export const sqliteBool = z
  .union([z.literal(0), z.literal(1)])
  .transform((n) => n === 1);

/** A TEXT column holding JSON. Parse, then validate the parsed value against `shape`.
 *  Malformed JSON becomes a clean zod issue (a rejected read), never a thrown SyntaxError. */
export const jsonColumn = <T extends z.ZodTypeAny>(shape: T) =>
  z
    .string()
    .transform((s, ctx): unknown => {
      try {
        return JSON.parse(s);
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid JSON in column" });
        return z.NEVER;
      }
    })
    .pipe(shape);

/** An opaque-but-well-formed JSON object (e.g. `cards.fsrs_state`, `resources.metadata`).
 *  003 guarantees only that it parses to an object; the owning feature defines the real shape. */
export const jsonObject = z.record(z.string(), z.unknown());
