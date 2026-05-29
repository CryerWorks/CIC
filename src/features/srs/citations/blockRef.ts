import type { VaultReader } from "../../../vault/reader";
import type { VaultWriter } from "../../../vault/writer";
import { ensureBlockMarker } from "./blockId";

export interface BlockRefDeps {
  reader: VaultReader;
  writer: VaultWriter;
}

export type CiteNoteResult =
  | { status: "cited"; blockId: string }
  | { status: "unchanged"; blockId: string }
  | { status: "absent" }
  | { status: "conflict"; reason: "drifted" | "unmanaged"; notePath: string };

/**
 * Cite a paragraph of a vault note (F3.6): read the note, insert a stable `^block-id` marker, and
 * write it back **through `VaultWriter`** (Constitution I — the only `.md` write path). Honors the
 * never-clobber guard: an externally-edited or never-app-written note returns a `conflict` rather
 * than being overwritten; the caller retries with `{ overwrite: true }` after the user confirms
 * ("cite anyway"). Idempotent — re-citing an already-marked paragraph is `unchanged`.
 */
export async function citeNoteParagraph(
  deps: BlockRefDeps,
  notePath: string,
  paragraph: string,
  opts: { overwrite?: boolean } = {},
): Promise<CiteNoteResult> {
  if (!(await deps.reader.exists(notePath))) return { status: "absent" };

  const note = await deps.reader.readNote(notePath);
  const { body, blockId, changed } = ensureBlockMarker(note.body, paragraph);
  if (!changed) return { status: "unchanged", blockId };

  const result = await deps.writer.writeNote(
    notePath,
    { frontmatter: note.data, body },
    { overwrite: opts.overwrite },
  );
  if (result.status === "conflict") {
    return { status: "conflict", reason: result.reason, notePath };
  }
  return { status: "cited", blockId };
}
