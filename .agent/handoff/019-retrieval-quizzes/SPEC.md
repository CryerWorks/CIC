# SPEC: Retrieval Practice Quizzes (F5)

## Quiz Prompt

```
You are generating retrieval practice questions. Ground your questions in the PROVIDED CONTEXT.

RULES:
1. Generate exactly {N} questions ordered easy→hard.
2. Each question should test recall and understanding, not recognition.
3. Vary the surface form from previous quizzes on this topic (if provided).
4. Include a clear, concise reference answer for each question.
5. Format each question as: Q: <question>\nA: <answer>

PROVIDED CONTEXT:
--- BEGIN CONTEXT ---
{contextChunks}
--- END CONTEXT ---

PREVIOUS QUIZ QUESTIONS (for surface-form variability — generate DIFFERENT questions):
{previousQuestions}

Generate {N} retrieval questions on the topic: "{topic}"
```

## Quiz State Machine

```
[Generate] → [Question 1..N: answer → reveal → self-rate] → [Summary] → [Spawn cards]
```

## Self-Rating

After each answer reveal, the learner picks:
- ✅ Got it — I knew this
- 🟡 Close — I was on the right track but missed details
- ❌ Missed — I didn't know this

## Card Spawning

For each "Missed" item:
- Front = the quiz question text
- Back = the AI's reference answer
- Via existing `createCard(db, {courseId, front, back})`
- Citations: `card_resources` linked to the quiz's grounding Resources

## Quiz Sessions Table (m0011)

```sql
CREATE TABLE quiz_sessions (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id),
  course_id TEXT REFERENCES courses(id),
  topic TEXT NOT NULL,
  questions TEXT NOT NULL, -- JSON array of question texts
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
