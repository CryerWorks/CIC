import { useState } from "react";
import { Button, Callout, Tag } from "../../components/ui";
import { useCardCitations } from "./useCardCitations";
import type { Card } from "../../db";

const FIELD = "rounded-sm border border-line bg-surface-sunken px-2 py-1 text-sm text-text";

/** Citation editor for a saved card (Feature 010, US4): attach/detach Resource citations with a
 *  locator (F3.7), and cite a paragraph of the card's source note (F3.6). */
export function CardCitations({ card }: { card: Card }) {
  const { citations, resources, addCitation, removeCitation, citeNote } = useCardCitations(card.id);
  const [resourceId, setResourceId] = useState("");
  const [locator, setLocator] = useState("");
  const [paragraph, setParagraph] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);

  const onAdd = async () => {
    if (!resourceId) return;
    await addCitation(resourceId, locator.trim() || null);
    setResourceId("");
    setLocator("");
  };

  const onCiteNote = async (overwrite = false) => {
    if (!card.note_path || !paragraph.trim()) return;
    const res = await citeNote(card.note_path, paragraph.trim(), overwrite);
    if (res.status === "conflict") {
      setConflict(paragraph.trim());
      setNoteMsg(null);
    } else if (res.status === "absent") {
      setNoteMsg("That note isn't in the vault.");
      setConflict(null);
    } else {
      setNoteMsg(`Cited paragraph as ^${res.blockId}.`);
      setConflict(null);
      setParagraph("");
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="text-sm font-semibold text-text-dim">Citations</h3>

      {citations.length > 0 && (
        <ul className="flex flex-col gap-1">
          {citations.map((c) => (
            <li key={c.resource.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-text">
                {c.resource.title}
                {c.locator && <span className="text-text-dim"> · {c.locator}</span>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void removeCitation(c.resource.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {resources.length > 0 ? (
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-text-dim">Resource</span>
            <select aria-label="Resource" value={resourceId} onChange={(e) => setResourceId(e.target.value)} className={FIELD}>
              <option value="">— choose —</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-dim">Locator</span>
            <input aria-label="Locator" value={locator} onChange={(e) => setLocator(e.target.value)} placeholder="page=10" className={FIELD} />
          </label>
          <Button size="sm" variant="secondary" disabled={!resourceId} onClick={() => void onAdd()}>
            Add citation
          </Button>
        </div>
      ) : (
        <p className="text-xs text-text-dim">Register a Resource to cite it here.</p>
      )}

      {card.note_path && (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-dim">Cite a paragraph of {card.note_path}</span>
            <input aria-label="Note paragraph" value={paragraph} onChange={(e) => setParagraph(e.target.value)} className={FIELD} />
          </label>
          <div>
            <Button size="sm" variant="secondary" disabled={!paragraph.trim()} onClick={() => void onCiteNote(false)}>
              Cite paragraph
            </Button>
          </div>
          {card.note_block_id && <Tag tone="neutral">^{card.note_block_id}</Tag>}
          {noteMsg && <p className="text-xs text-text-dim">{noteMsg}</p>}
          {conflict && (
            <Callout variant="warn" title="Note changed outside the app">
              <div className="flex flex-col gap-2">
                <span>The note was edited in Obsidian, so the marker wasn&apos;t written.</span>
                <div>
                  <Button size="sm" onClick={() => void onCiteNote(true)}>
                    Cite anyway
                  </Button>
                </div>
              </div>
            </Callout>
          )}
        </div>
      )}
    </div>
  );
}
