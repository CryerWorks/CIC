import type { DailyLoop } from "../useDailyLoop";
import { FIELD } from "./field";

/** Step 5 — capture one atomic note. Written to the vault (via VaultWriter) on finish; its title
 *  becomes the filename and the spawned cards' source note. Plain Markdown, supports [[wikilinks]]. */
export function NoteStep({ loop }: { loop: DailyLoop }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-text-dim">Capture one atomic note. It's written to your vault when you finish.</p>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-text">Note title</span>
        <input
          aria-label="Note title"
          value={loop.noteTitle}
          onChange={(e) => loop.setNoteTitle(e.target.value)}
          placeholder="Epsilon-delta limit"
          className={FIELD}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-text">Note (Markdown — supports [[wikilinks]])</span>
        <textarea
          aria-label="Note body"
          rows={6}
          value={loop.noteBody}
          onChange={(e) => loop.setNoteBody(e.target.value)}
          className={FIELD}
        />
      </label>
    </div>
  );
}
