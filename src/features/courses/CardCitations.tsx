import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Callout, Tag } from "../../components/ui";
import { useCardCitations } from "./useCardCitations";
import { resourceTarget, openCitation } from "../srs/citations/openTarget";
import type { Card } from "../../db";

const FIELD = "w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-sm text-text";

/** Citation editor for a saved card (Feature 010, US4). Two distinct things:
 *  - **Resource citations** (F3.7): attach a registered Resource (scoped to this card's Course)
 *    with an optional locator (page/timestamp/anchor). These show an "Open" deep-link in Review.
 *  - **Note paragraph** (F3.6): drop a stable block-ref marker into the card's source note. */
export function CardCitations({ card }: { card: Card }) {
  const { citations, resources, error, addCitation, removeCitation, citeNote } = useCardCitations(
    card.id,
    card.course_id,
  );
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

  // Time-based media take a timestamp locator (mm:ss / seconds) rather than a page/anchor. A
  // video_url's timestamp deep-links via `?t=`; for local video/audio it's a human reference.
  const selectedKind = resources.find((r) => r.id === resourceId)?.kind;
  const timed = selectedKind === "video_url" || selectedKind === "video_file" || selectedKind === "audio";

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
    <div className="mt-3 flex flex-col gap-5 border-t border-line pt-4">
      {/* Resource citations (F3.7) */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-dim">Resource citations</h3>
        {error && <p className="text-xs text-danger">{error}</p>}

        {citations.length > 0 && (
          <ul className="flex flex-col gap-1">
            {citations.map((c) => {
              const target = resourceTarget(c.resource, c.locator);
              return (
                <li key={c.resource.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-text">
                    {c.resource.title}
                    {c.locator && <span className="text-text-dim"> · {c.locator}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={!target} onClick={() => void openCitation(target)}>
                      Open
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void removeCitation(c.resource.id)}>
                      Remove
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {resources.length > 0 ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-dim">Source</span>
              <select
                aria-label="Resource"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className={FIELD}
              >
                <option value="">— choose a source —</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-dim">{timed ? "Timestamp (optional)" : "Locator (optional)"}</span>
              <input
                aria-label={timed ? "Timestamp" : "Locator"}
                value={locator}
                onChange={(e) => setLocator(e.target.value)}
                placeholder={timed ? "e.g. 1:30" : "page=10"}
                className={FIELD}
              />
            </label>
            <div>
              <Button size="sm" variant="secondary" disabled={!resourceId} onClick={() => void onAdd()}>
                Add citation
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-dim">
            No resources are linked to this course yet.{" "}
            <Link to="/resources" className="font-medium text-brand underline">
              Register one
            </Link>{" "}
            and link it to this course to cite it here.
          </p>
        )}
      </section>

      {/* Note paragraph block-ref (F3.6) */}
      {card.note_path && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text-dim">Cite a note paragraph</h3>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-dim">
              Paste a paragraph of <span className="font-mono text-text">{card.note_path}</span> to mark
            </span>
            <input
              aria-label="Note paragraph"
              value={paragraph}
              onChange={(e) => setParagraph(e.target.value)}
              className={FIELD}
            />
          </label>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={!paragraph.trim()} onClick={() => void onCiteNote(false)}>
              Cite paragraph
            </Button>
            {card.note_block_id && <Tag tone="neutral">^{card.note_block_id}</Tag>}
          </div>
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
        </section>
      )}
    </div>
  );
}
