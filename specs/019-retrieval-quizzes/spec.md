# Feature Specification: AI Retrieval Practice Quizzes (F5)

**Feature Branch**: `019-retrieval-quizzes`

**Created**: 2026-06-15

**Status**: Draft

**Input**: F5 — AI Retrieval Practice Quizzes. On demand or scheduled, the AI generates retrieval questions from a note/course (ordered easy→hard, answers withheld until response). Results can spawn cards for missed items. Distinct from SRS: this is generative active recall over recent material. Uses `router.chat('reasoning', …)` from 016 and RAG retrieval from 017.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate and Take a Quiz (Priority: P1)

A learner wants to test their knowledge on a topic they've been studying. They open the Quiz panel from anywhere in the app (Daily Loop self-test step, Course detail, Search Corpus page), specify the topic (or use the current Course context), and the AI generates 5 retrieval questions ordered easy→hard, grounded in the learner's own vault notes and ingested Resources (RAG from 017). The learner answers each question in a text input. **Answers are withheld** — the AI shows each question but the answer is only revealed after the learner submits their response. On submit, the learner sees the AI's answer alongside their own, and self-rates (Got it / Close / Missed). At the end, the learner sees a summary and can spawn SRS cards for missed items.

**Why this priority**: Retrieval practice is the most evidence-backed learning technique. This feature closes the loop between "having material" (RAG in 017) and "testing yourself on it" — the missing half of the study cycle. It's independently testable and delivers immediate learning value.

**Independent Test**: Open the Quiz panel from a Course with ingested Resources, generate a quiz, answer all questions, self-rate, verify summary shows correct counts, spawn cards for missed items.

**Acceptance Scenarios**:

1. **Given** a Course with ingested Resources, **When** the learner opens the Quiz panel and generates a quiz, **Then** 5 retrieval questions appear, ordered from foundational to advanced, each grounded in the Course's Resources.
2. **Given** a generated quiz, **When** the learner types an answer to question 1 and submits, **Then** the AI's reference answer is revealed alongside the learner's answer, and the self-rating buttons (Got it / Close / Missed) appear.
3. **Given** all questions answered and self-rated, **When** the learner finishes the quiz, **Then** a summary shows: correct count, close count, missed count. "Missed" items have a "Spawn card" button.
4. **Given** a quiz with missed items, **When** the learner clicks "Spawn cards for missed", **Then** new SRS cards are created for each missed item (front = question, back = AI answer), citing the grounding Resource.

---

### User Story 2 - Quiz from Any Context (Priority: P2)

The learner can generate a quiz from multiple entry points: a Course (questions scoped to that Course's Resources), a specific Resource (questions about that Resource), the Feynman panel (gap-topic quiz — questions about the gaps just identified), or a free-text topic. Each context seeds the RAG retrieval differently but the quiz experience is identical.

**Why this priority**: Contextual quizzes are more useful than global ones — the learner generates a quiz about what they're actively studying. Lower priority than P1 because the quiz engine is the same regardless of context.

**Independent Test**: Generate a quiz from a Course context, verify questions reference Course Resources. Generate from free-text topic, verify questions cover the topic.

**Acceptance Scenarios**:

1. **Given** the Daily Loop self-test step, **When** the learner opens the Quiz panel, **Then** the quiz is scoped to the current Course's Resources + the session's notes.
2. **Given** a specific Resource detail page, **When** the learner opens the Quiz panel, **Then** the quiz is scoped tightly to that Resource's content.
3. **Given** a Feynman conversation with identified gaps, **When** the learner clicks "Quiz me on these gaps," **Then** the quiz questions target the specific gaps identified.

---

### User Story 3 - Surface-Form Variability (Priority: P3)

The same underlying concept tested across multiple quiz sessions should use different surface forms — different problem framings, different examples, different contexts pointing at the same concept. This implements Schmidt & Bjork's "variability of practice" — reducing contextual interference and driving transfer. When generating a quiz, the AI is instructed to vary the framing from previous quizzes on the same topic (tracked by a lightweight "last quiz" record per Course).

**Why this priority**: Surface-form variability is a PRD-locked design requirement (v0.7) but it's a refinement on top of a working quiz system. The quiz is valuable without it; variability makes it more effective over repeated use.

**Independent Test**: Generate two quizzes for the same Course, verify that the questions use different framings/contexts/examples for the same underlying concepts.

**Acceptance Scenarios**:

1. **Given** a Course that has had a previous quiz, **When** the learner generates a new quiz for the same Course, **Then** the AI prompt includes the previous quiz's questions and instructs the AI to vary surface form (different framings, contexts, examples) while testing the same concepts.
2. **Given** a Course that has never been quizzed, **When** the learner generates a quiz, **Then** the system stores a record of this quiz for future variability reference.

---

### Edge Cases

- What happens when the AI provider is offline? The Quiz panel shows a clear error — quiz questions and progress are preserved so the learner can retry.
- What happens during lockdown mode? Quiz generation is blocked if the reasoning provider is remote (same lockdown gate as Feynman tutor, 018).
- What happens when there's no RAG context for the topic? The AI generates questions from general knowledge but flags them as ungrounded ("⚠️ Not grounded in your materials — treat as general practice").
- What happens when the learner leaves mid-quiz? The quiz is lost — no auto-save. A confirmation dialog warns before navigation (same pattern as 018).
- What happens with math/LaTeX in questions? Questions and answers containing LaTeX render correctly in the quiz panel.
- What happens when card spawning fails? Each card spawn is independent — failures are reported per-card, not as a batch failure.
- What happens if the AI generates more or fewer than the requested question count? The quiz accepts the AI's output as-is (between 3–10 questions) and surfaces the actual count.

## Requirements *(mandatory)*

### Functional Requirements

**Quiz Generation**

- **FR-001**: System MUST provide a Quiz panel accessible from the Daily Loop self-test step, Course detail pages, Resource detail pages, and the Feynman panel (gap-quiz mode).
- **FR-002**: System MUST generate retrieval questions via `router.chat('reasoning', messages, {containsVaultContent: true})` with a quiz-specific system prompt that instructs: generate N questions (default 5), ground in provided context, order easy→hard, withhold answers, use the following format: `Q: <question>\nA: <answer>`.
- **FR-003**: System MUST retrieve RAG context (`useRAG().search()`, 017) scoped to the quiz context: Course Resources for course-scoped quizzes, specific Resource content for resource-scoped quizzes, identified gap topics for Feynman-gap quizzes, or free-text topic search for global quizzes.
- **FR-004**: System MUST batch quiz generation into a single AI call — all questions + answers returned at once, not conversationally.

**Quiz Taking**

- **FR-005**: System MUST display questions one at a time (single-question view) with a text input for the learner's response.
- **FR-006**: System MUST withhold the AI's answer until the learner submits their response. On submit, the AI's reference answer is displayed alongside the learner's answer.
- **FR-007**: System MUST provide self-rating after each answer: Got it / Close / Missed. The learner compares their answer to the AI's and rates themselves.
- **FR-008**: System MUST show a quiz progress indicator (e.g., "Question 3 of 5").

**Quiz Results**

- **FR-009**: System MUST display a quiz summary after all questions are answered: count of Got it / Close / Missed, with each missed question shown.
- **FR-010**: System MUST allow the learner to spawn SRS cards for missed items. Each card: front = the quiz question, back = the AI's answer, cited to the grounding Resources.
- **FR-011**: System MUST log quiz results for the learner's reference (no mastery tracking — the quiz is practice, not assessment).

**Surface-Form Variability**

- **FR-012**: System MUST store lightweight quiz records (`quiz_sessions` table: id, course_id, topic, questions JSON, created_at) for the current Course to enable variability across sessions.
- **FR-013**: System MUST include previous quiz questions in the AI prompt for the same Course, instructing the AI to vary surface form (different framings, examples, contexts) while testing the same underlying concepts per Schmidt & Bjork's variability-of-practice principle.

**Card Spawning**

- **FR-014**: System MUST create SRS cards via the existing `createCard` repository function (010), with the quiz question as front, AI answer as back, and grounding Resource citations from `card_resources`.
- **FR-015**: System MUST handle card-spawn failures individually — a failure on card 3 does not block card 4. The summary reports both successes and failures.

**Guardrails**

- **FR-016**: System MUST enforce the lockdown gate: if lockdown is ON and the reasoning provider is remote, quiz generation is blocked with a clear message (Constitution II).
- **FR-017**: System MUST include an instruction in the prompt: "If the provided context does not contain enough information to generate good questions, flag the quiz as ungrounded." Ungrounded quizzes use an "⚠️ Not grounded in your materials" banner.

### Key Entities

- **Quiz Session**: A batch of generated questions + the learner's answers + self-ratings. Ephemeral while the quiz is in progress. On completion, the session summary is logged but not persisted to vault (the learner creates cards for missed items instead).
- **Quiz Question**: A single retrieval question with the AI's reference answer. Attributes: question text, answer text, learner's response, self-rating (got it / close / missed).
- **Quiz Record** (`quiz_sessions` table): Lightweight record for surface-form variability: id, course_id, topic, questions (JSON array of question texts), created_at. Not a full session log — just enough to inform the next quiz generation.

## Success Criteria *(mandatory)*

- **SC-001**: A learner can generate a 5-question retrieval quiz grounded in their Course Resources in under 15 seconds (including RAG retrieval + AI generation).
- **SC-002**: Self-rating after each question takes under 5 seconds — the UI transitions smoothly from answer-reveal to rating to next question.
- **SC-003**: A learner can spawn SRS cards for all missed items from a 5-question quiz in under 10 seconds (card creation + citation linking).
- **SC-004**: Two quizzes on the same Course generate questions with different surface forms (different framings/contexts/examples) in at least 3 out of 5 questions.
- **SC-005**: Lockdown mode blocks quiz generation with a clear message — zero chat requests reach a remote provider.
- **SC-006**: A quiz with no RAG context shows the "ungrounded" warning banner.

## Assumptions

- **Reuses existing card infrastructure**: Card spawning uses the existing `createCard` (010) and `card_resources` — no new card-related schema.
- **Quiz is learner-triggered, not scheduled**: The F6 interleaving scheduler (Phase 4) will eventually trigger quizzes as part of the daily mix, but for v1 the learner explicitly starts quizzes.
- **Single AI call per quiz**: All questions are generated in one call — not conversational. This is a different interaction pattern from the Feynman tutor (018) which is a back-and-forth.
- **No spaced-repetition on quizzes**: Quiz results don't feed FSRS — they inform card spawning. The quiz is retrieval practice, not SRS.
- **Lightweight quiz records only**: `quiz_sessions` stores question texts as JSON for variability reference — not full answers, not ratings. The learner's answers and ratings are ephemeral.
