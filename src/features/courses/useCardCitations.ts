import { useCallback, useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useVault } from "../../app/providers/VaultProvider";
import {
  listCardResources,
  addCardResource,
  removeCardResource,
  listCourseResources,
  updateCardContent,
  type CardCitation,
  type Resource,
} from "../../db";
import { citeNoteParagraph, type CiteNoteResult } from "../srs/citations/blockRef";

/**
 * Citation management for one card (Feature 010, US4). Resource citations (F3.7) via
 * `card_resources`, and a block-ref into the card's source note (F3.6) written through
 * `VaultWriter`. A drift/unmanaged conflict on the note write is surfaced so the UI can offer
 * "cite anyway". The Resource picker is scoped to the card's **Course** (only Resources linked to
 * that Course are citable — less guesswork about what connects). Used only under a ready vault.
 */
export function useCardCitations(cardId: string, courseId: string) {
  const db = useDb();
  const vault = useVault();
  const [citations, setCitations] = useState<CardCitation[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cites, res] = await Promise.all([
        listCardResources(db, cardId),
        listCourseResources(db, courseId),
      ]);
      setCitations(cites);
      setResources(res);
      setError(null);
    } catch (e) {
      // Surface the failure instead of silently showing an empty list (a swallowed error here
      // is exactly what made a real citation look like "no citation").
      setError(e instanceof Error ? e.message : "Couldn't load citations.");
    }
  }, [db, cardId, courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addCitation = useCallback(
    async (resourceId: string, locator: string | null) => {
      await addCardResource(db, { cardId, resourceId, locator: locator || null });
      await load();
    },
    [db, cardId, load],
  );

  const removeCitation = useCallback(
    async (resourceId: string) => {
      await removeCardResource(db, cardId, resourceId);
      await load();
    },
    [db, cardId, load],
  );

  /** Cite a paragraph of `notePath`; on success store the block-id on the card. Returns the result
   *  so the caller can surface a conflict and retry with `overwrite`. */
  const citeNote = useCallback(
    async (notePath: string, paragraph: string, overwrite = false): Promise<CiteNoteResult> => {
      const result = await citeNoteParagraph(
        { reader: vault.reader, writer: vault.writer },
        notePath,
        paragraph,
        { overwrite },
      );
      if (result.status === "cited" || result.status === "unchanged") {
        await updateCardContent(db, cardId, { noteBlockId: result.blockId });
      }
      return result;
    },
    [db, cardId, vault],
  );

  return { citations, resources, error, addCitation, removeCitation, citeNote };
}
