import { useCallback, useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import {
  getCourse,
  listCardsByCourse,
  createCard,
  updateCardContent,
  deleteCard,
  type Course,
  type Card,
} from "../../db";

export interface CardInput {
  front: string;
  back: string;
  notePath?: string | null;
}

/**
 * Per-course card management for the Course-detail screen (Feature 010, US2). Loads the course +
 * its cards (keyed on the course id), and exposes create/edit/delete. Cards are vault-scoped via
 * the course, so no vault id is threaded here — the detail screen is only reachable under a ready
 * vault. Editing content never resets a card's schedule (the repo enforces this — FR-011).
 */
export function useCourseCards(courseId: string) {
  const db = useDb();
  const [course, setCourse] = useState<Course | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [c, cs] = await Promise.all([getCourse(db, courseId), listCardsByCourse(db, courseId)]);
    setCourse(c);
    setCards(cs);
  }, [db, courseId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const addCard = useCallback(
    async (input: CardInput): Promise<Card> => {
      const card = await createCard(db, {
        courseId,
        front: input.front,
        back: input.back,
        notePath: input.notePath ?? null,
      });
      await load();
      return card;
    },
    [db, courseId, load],
  );

  const editCard = useCallback(
    async (id: string, input: CardInput) => {
      await updateCardContent(db, id, { front: input.front, back: input.back, notePath: input.notePath ?? null });
      await load();
    },
    [db, load],
  );

  const removeCard = useCallback(
    async (id: string) => {
      await deleteCard(db, id);
      await load();
    },
    [db, load],
  );

  return { loading, course, cards, addCard, editCard, removeCard };
}
