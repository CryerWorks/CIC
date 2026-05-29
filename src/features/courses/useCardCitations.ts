import { useCallback, useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useVault, useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  listCardResources,
  addCardResource,
  removeCardResource,
  listResources,
  updateCardContent,
  type CardCitation,
  type Resource,
} from "../../db";
import { citeNoteParagraph, type CiteNoteResult } from "../srs/citations/blockRef";

/**
 * Citation management for one card (Feature 010, US4). Resource citations (F3.7) via
 * `card_resources`, and a block-ref into the card's source note (F3.6) written through
 * `VaultWriter`. A drift/unmanaged conflict on the note write is surfaced so the UI can offer
 * "cite anyway". Used only under a ready vault (it calls `useVault()`).
 */
export function useCardCitations(cardId: string) {
  const db = useDb();
  const vault = useVault();
  const vaultId = useActiveVaultId();
  const [citations, setCitations] = useState<CardCitation[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);

  const load = useCallback(async () => {
    const [cites, res] = await Promise.all([
      listCardResources(db, cardId),
      vaultId ? listResources(db, vaultId) : Promise.resolve<Resource[]>([]),
    ]);
    setCitations(cites);
    setResources(res);
  }, [db, cardId, vaultId]);

  useEffect(() => {
    let active = true;
    load().catch(() => {});
    return () => {
      active = false;
      void active;
    };
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

  return { citations, resources, addCitation, removeCitation, citeNote };
}
