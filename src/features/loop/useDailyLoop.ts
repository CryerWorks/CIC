import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useVault, useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  getCourse,
  getSession,
  listResources,
  listSessionAssignments,
  listPretestResponses,
  listSessionCardDrafts,
  finalizeSession,
  getSourcesForSession,
  markSourceDone,
  listCourseSessions,
  type Resource,
  type AssignmentKind,
  type SessionSourceRow,
} from "../../db";
import type { NoteInput } from "../../vault";
import { buildWriteup, writeupPath } from "./writeup";

/** A planned assignment, resolved against the loaded Resources for opening + labelling. */
export interface AssignmentView {
  resourceId: string;
  resource: Resource | undefined;
  locator: string | null;
  kind: AssignmentKind;
}
/** A planned pretest question + the learner's in-session attempt (filled while doing). */
export interface PretestAttempt {
  id: string;
  question: string;
  answer: string;
}
/** A card being completed this session (seeded from a staged draft; the learner edits front/back). */
export interface DoingCard {
  key: string;
  front: string;
  back: string;
}

export type FinishState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "done"; writeupPath: string; noteWarning: string | null }
  | { status: "error"; message: string; canRetry: boolean };

/**
 * The **doing** half of the Daily Loop (Feature 012, PRD F2). Loads a *planned* session (its
 * objective, assignments, pretest questions, and card drafts — established at plan time) and holds
 * the in-session work in memory, persisting it **on finish** (research R2/R7): `finalizeSession`
 * (DB) flips the session to completed, records answers, and materializes the cards; then the vault
 * writes (atomic note + writeup). A vault failure leaves the session completed and offers a retry.
 * Abandoning (unmounting without finishing) leaves the session **planned** and re-doable (R11).
 *
 * Feature 023 extension: loads `sessionSources` (session_sources rows) for rich media card display
 * in ActiveStudyStep, with per-source completion tracking. Also loads `milestoneSessions` for the
 * PlanningStep session ordering view.
 */
export function useDailyLoop(sessionId: string) {
  const db = useDb();
  const vault = useVault();
  const vaultId = useActiveVaultId() ?? "";

  const [loading, setLoading] = useState(true);
  const [objective, setObjective] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [assignments, setAssignments] = useState<AssignmentView[]>([]);
  const [pretest, setPretest] = useState<PretestAttempt[]>([]);
  const [cards, setCards] = useState<DoingCard[]>([]);

  const [retrievalText, setRetrievalText] = useState("");
  const [selfTestText, setSelfTestText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const [finish, setFinish] = useState<FinishState>({ status: "idle" });
  const startedAt = useRef(Date.now());
  const savedRef = useRef(false);
  const pendingRef = useRef<{ writeupPath: string; writeup: NoteInput; note: { path: string; body: string } | null } | null>(null);

  // Feature 023: session sources for rich media cards
  const [sessionSources, setSessionSources] = useState<SessionSourceRow[]>([]);
  const [milestoneSessions, setMilestoneSessions] = useState<
    { id: string; title: string; status: "completed" | "active" | "locked" }[]
  >([]);

  /** Whether all sources for the current session are marked done (gate for Feynman step). */
  const allSourcesDone = useMemo(
    () => sessionSources.length > 0 && sessionSources.every((s) => s.completed),
    [sessionSources],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      const session = await getSession(db, sessionId);
      if (!session) {
        if (active) setLoading(false);
        return;
      }
      setCourseId(session.course_id);
      const [course, resources, asg, pre, drafts, sources] = await Promise.all([
        getCourse(db, session.course_id),
        listResources(db, vaultId),
        listSessionAssignments(db, sessionId),
        listPretestResponses(db, sessionId),
        listSessionCardDrafts(db, sessionId),
        getSourcesForSession(db, sessionId),
      ]);
      if (!active) return;
      const byId = new Map(resources.map((r) => [r.id, r]));
      setObjective(session.objective ?? "");
      setCourseTitle(course?.title ?? "");
      setAssignments(asg.map((a) => ({ resourceId: a.resource_id, resource: byId.get(a.resource_id), locator: a.locator, kind: a.assignment_kind })));
      setPretest(pre.map((p) => ({ id: p.id, question: p.question, answer: p.user_response ?? "" })));
      setCards(drafts.map((d) => ({ key: d.id, front: d.front, back: d.back })));
      setSessionSources(sources);

      // Load milestone sessions for PlanningStep context
      if (sources.length > 0) {
        const allSessions = await listCourseSessions(db, session.course_id);
        const milestoneSess = allSessions
          .filter((s) => s.milestone_id === session.milestone_id || !session.milestone_id)
          .map((s) => ({
            id: s.id,
            title: s.objective ?? "(no objective)",
            status: (s.id === sessionId
              ? "active"
              : s.status === "completed"
                ? "completed"
                : "locked") as "completed" | "active" | "locked",
          }));
        setMilestoneSessions(milestoneSess);
      }

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [db, sessionId, vaultId]);

  /** Toggle a session source's done state by persisting the change and updating local state. */
  const onToggleSourceDone = useCallback(
    async (sourceId: string) => {
      await markSourceDone(db, sourceId);
      setSessionSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, completed: !s.completed } : s)),
      );
    },
    [db],
  );

  const setPretestAnswer = useCallback((id: string, answer: string) => {
    setPretest((ps) => ps.map((p) => (p.id === id ? { ...p, answer } : p)));
  }, []);
  const setCardField = useCallback((key: string, field: "front" | "back", value: string) => {
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  }, []);
  const addCard = useCallback(() => {
    setCards((cs) => [...cs, { key: crypto.randomUUID(), front: "", back: "" }]);
  }, []);
  const removeCard = useCallback((key: string) => {
    setCards((cs) => cs.filter((c) => c.key !== key));
  }, []);

  const doVaultWrites = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    let noteWarning: string | null = null;
    try {
      if (pending.note) {
        const r = await vault.writer.writeNote(pending.note.path, { frontmatter: {}, body: pending.note.body });
        if (r.status === "conflict") noteWarning = `A note "${pending.note.path}" already exists — it was left untouched.`;
      }
    } catch {
      noteWarning = "The atomic note couldn't be written to the vault.";
    }
    try {
      const w = await vault.writer.writeNote(pending.writeupPath, pending.writeup);
      if (w.status === "conflict") {
        setFinish({ status: "error", message: "The writeup couldn't be written (the file changed outside the app).", canRetry: true });
        return;
      }
      setFinish({ status: "done", writeupPath: pending.writeupPath, noteWarning });
    } catch (e) {
      setFinish({ status: "error", message: e instanceof Error ? e.message : "Couldn't write the writeup to the vault.", canRetry: true });
    }
  }, [vault]);

  const runFinish = useCallback(async () => {
    setFinish({ status: "saving" });

    const dateIso = new Date().toISOString();
    const path = writeupPath(dateIso, objective.trim() || "session", sessionId);
    const noteRel = noteTitle.trim() ? `${noteTitle.trim()}.md` : null;
    const minutes = Math.max(0, Math.round((Date.now() - startedAt.current) / 60000));
    const didRetrieval = retrievalText.trim().length > 0;
    const completedCards = cards
      .filter((c) => c.front.trim() && c.back.trim())
      .map((c) => ({ front: c.front.trim(), back: c.back.trim() }));
    const pretestAnswers = pretest.map((p) => ({ id: p.id, userResponse: p.answer.trim() || null }));

    if (!savedRef.current) {
      try {
        await finalizeSession(db, {
          sessionId,
          minutes,
          didRetrieval,
          writeupPath: path,
          pretestAnswers,
          cards: completedCards,
          notePath: noteRel,
        });
        savedRef.current = true;
      } catch (e) {
        setFinish({ status: "error", message: e instanceof Error ? e.message : "Couldn't save the session.", canRetry: true });
        return;
      }
    }

    const writeup = buildWriteup({
      date: dateIso,
      courseTitle,
      objective: objective.trim(),
      pretest: pretest.map((p) => ({ question: p.question, userResponse: p.answer.trim() || null })),
      assignments: assignments.map((a) => ({
        label: `${a.resource?.title ?? a.resourceId} (${a.kind})`,
        locator: a.locator,
      })),
      retrievalText,
      selfTestText,
      cardsMade: completedCards,
      notePath: noteRel,
    });
    pendingRef.current = { writeupPath: path, writeup, note: noteRel ? { path: noteRel, body: noteBody } : null };
    await doVaultWrites();
  }, [db, sessionId, objective, noteTitle, noteBody, retrievalText, selfTestText, assignments, pretest, cards, courseTitle, doVaultWrites]);

  const retry = useCallback(async () => {
    setFinish({ status: "saving" });
    if (savedRef.current && pendingRef.current) {
      await doVaultWrites();
    } else {
      await runFinish();
    }
  }, [doVaultWrites, runFinish]);

  return {
    loading,
    objective,
    courseTitle,
    courseId,
    assignments,
    pretest,
    setPretestAnswer,
    cards,
    setCardField,
    addCard,
    removeCard,
    retrievalText,
    setRetrievalText,
    selfTestText,
    setSelfTestText,
    noteTitle,
    setNoteTitle,
    noteBody,
    setNoteBody,
    finish,
    runFinish,
    retry,
    // Feature 023: session sources
    sessionSources,
    onToggleSourceDone,
    allSourcesDone,
    milestoneSessions,
  };
}

export type DailyLoop = ReturnType<typeof useDailyLoop>;
