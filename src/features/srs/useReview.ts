import { useCallback, useEffect, useRef, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useVault, useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  setSetting,
  listDueCards,
  recordReview,
  getNewCardCap,
  DEFAULT_NEW_CARD_CAP,
  NEW_CARD_CAP_KEY,
  type Card,
} from "../../db";
import { createScheduler } from "./fsrs/scheduler";
import type { Grade } from "./fsrs/types";

/**
 * Review-session state for the active vault. Loads the due queue once on mount (keyed on the
 * active vault so a vault switch re-scopes — FR-020), then walks it card-by-card: the back is
 * never exposed until `reveal()` (retrieval-before-reveal, Constitution III), and `grade()`
 * records the review (advancing FSRS state) before moving on. An "Again" grade re-queues the
 * card so it returns later in the same session. Used only inside a vault-`ready` subtree.
 */
export function useReview() {
  const db = useDb();
  useVault(); // assert the gate — review screens render only when a vault is ready
  const vaultId = useActiveVaultId();
  const scheduler = useRef(createScheduler()).current;

  const [queue, setQueue] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [cap, setCap] = useState(DEFAULT_NEW_CARD_CAP);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vaultId) return;
    let active = true;
    setLoading(true);
    (async () => {
      const effectiveCap = await getNewCardCap(db);
      const due = await listDueCards(db, vaultId, new Date().toISOString(), effectiveCap);
      if (!active) return;
      setCap(effectiveCap);
      setQueue(due);
      setIndex(0);
      setRevealed(false);
    })().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [db, vaultId]);

  const current = queue[index] ?? null;
  const remaining = queue.length - index;
  const done = !loading && current === null;

  const reveal = useCallback(() => setRevealed(true), []);

  const grade = useCallback(
    async (g: Grade, confidence: number, elapsedMs?: number) => {
      if (!current) return;
      const { card } = await recordReview(db, scheduler, {
        cardId: current.id,
        grade: g,
        confidence,
        elapsedMs: elapsedMs ?? null,
      });
      // Re-queue a failed card so it returns later this session (corrective re-exposure).
      if (g === "again") setQueue((q) => [...q, card]);
      setRevealed(false);
      setIndex((i) => i + 1);
    },
    [db, scheduler, current],
  );

  /** Persist the daily new-card cap; takes effect on the next queue load. */
  const setNewCardCap = useCallback(
    async (n: number) => {
      const clamped = Math.max(0, Math.floor(n));
      await setSetting(db, NEW_CARD_CAP_KEY, String(clamped));
      setCap(clamped);
    },
    [db],
  );

  return { loading, current, revealed, reveal, grade, remaining, done, cap, setNewCardCap };
}
