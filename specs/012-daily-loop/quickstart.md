# Quickstart — The Daily Loop (Feature 012, two-phase)

Live `tauri dev` walkthrough realizing the **PRD §12 Phase-2 milestone**: establish a session, then do it end-to-end, **no AI provider configured**. Automated tests cover the migration + data + writeup builder + stepper logic; this is the human end-to-end check.

**Pre-req**: a connected vault, one Domain → Course with a Milestone, and one registered **PDF Resource** with an internalized file (Feature 011), linked to that Course.

---

## PLAN — establish the session (US1)

## A — Plan a session on the Course (FR-001/002/006)
1. Open **Courses → your Course** (the Course-detail screen).
2. In the **Sessions** section, click **Plan a session**.
3. Pick the Milestone → **Expect**: the objective field is seeded with its capability; edit freely. Saving with an empty objective is blocked.

## B — Add assignments, pretest questions, card prompts (FR-003/004/005)
4. Add an **assignment**: the PDF Resource, kind **read**, locator `page=10`. Add a second for a physical **book** with a free-form locator.
5. Add **2 pretest questions** (questions only — no answers yet).
6. Add **1 card prompt** (a front; leave the back to complete while doing).
7. Click **Save plan**.
8. **Expect**: the planned session appears in the Course's **Sessions** list (objective + date). The vault has **no** new note, and **Review** shows **no** new card yet (planning writes nothing — SC-002).

## B′ — Cancel persists nothing (FR-030)
9. Open **Plan a session** again, type an objective, then **Cancel** → **Expect**: no new planned session.

---

## DO — go through the session (US2–US5)

## C — Start the planned session (FR-008/009)
10. Open **Daily Loop** from the sidebar → **Expect**: the planned session is listed. Click **Start**.
11. **Expect**: the flow shows the objective read-only and is pre-loaded with the plan's assignments, pretest questions, and card prompt.

## D — Pretest, ungraded (US5, FR-023, Constitution III)
12. Attempt the planned questions from memory.
13. **Expect**: no correct/incorrect marks, no score; wrong is framed as expected.

## E — Active study opens the source at its locator (US3, FR-013/014/015)
14. On **Active study**, the pre-assigned PDF is listed. Click **Open**.
15. **Expect**: the PDF opens at **page 10** (browser deep-link, per 011). The physical **book** shows its locator as text (no failed open). A `mm:ss-mm:ss` video assignment would open at the **start** of the range.

## F — Retrieve before reveal (FR-016, Constitution III)
16. Go to **Retrieve from memory** → **Expect**: the scratchpad is **empty**. Write a few lines of recall.

## G — Atomic note to the vault (FR-017/018, Constitution I)
17. On **Atomic note**, title it and write Markdown with a `[[wikilink]]` (held as a draft for finish).

## H — Self-test (FR-019)
18. Write a short explanation → **Expect**: no grading.

## I — Complete the staged card (US4, FR-020/021, SC-005)
19. On **Complete cards**, fill the back of the staged prompt.
20. **Expect**: the card will cite the session's PDF at `page=10` (inherited from the assignment).

## J — Finish: completed + writeup lands (US2, FR-012/025, SC-001/002)
21. Click **Finish**.
22. **Expect**:
    - A success message linking to the **writeup note**.
    - In the vault: `Sessions/<date> <objective-slug> (<id>).md` with `type: log` frontmatter and sections for objective, pretest, studied, recalled, self-test, cards made (empty sections omitted). The atomic note also exists.
    - On the Course's **Sessions** list the session is no longer **planned**; the Daily Loop's **recent** list shows it as completed.

## K — The card is new in review (FR-022, SC-006)
23. Open **Review** → **Expect**: the materialized card appears as **new** (not pre-reviewed/learned) and cites the PDF; opening its citation lands at page 10.

## L — Vault stays sacred & scoped (Constitution I, FR-029/SC-008)
24. Confirm the writeup is clean Markdown a person would happily keep; no binaries were written to the vault.
25. Switch to a different vault → **Expect**: neither this planned nor completed session appears in the other vault.

## M — Graceful writeup failure (edge case, R7)
26. (Optional) Lock the writeup's target file in another app, then finish a session aimed at that name → **Expect**: the session is still **completed**; the UI surfaces a writeup **retry**.

## N — Abandon doing leaves the plan (edge case, R11)
27. Start a planned session, write some recall, then navigate away → **Expect**: no writeup, no card; the session is **still planned** and can be re-done from the Daily Loop.
