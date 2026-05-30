# Quickstart: Projects — Applied Practice (MVP)

Live `tauri dev` walkthrough — the user's manual verification (the automated Vitest suite covers the pure/DB/sync logic; this confirms the real `VaultWriter`↔Obsidian round-trip, the OS file, and the UI). Run `npm run tauri dev`, connect a vault, and have a Course with ≥1 Milestone.

Prereq: a Course (e.g. "Linear Algebra") with at least one Milestone (e.g. "Diagonalize a matrix"). Open it at `/courses/:id`.

---

## A. Author a Project (US1)

1. On the Course-detail screen, find the **Projects** section → **New Project**.
2. Enter title "Diagonalize a 3×3 by hand", a capability ("I can diagonalize a real symmetric matrix unaided"), select the "Diagonalize a matrix" Milestone, pick template **math/proof**. Save.
3. **Expect**: the Project appears in the list tagged "new" (its underlying status is `open` — the tag reads as a state, not a verb). In your vault, a new file `Projects/diagonalize-a-3x3-by-hand-….md` exists with `cic-type: project` frontmatter (title, course, capability, status: open, milestones, opened) and a `## Problem / ## Approach / ## Work / ## Reflection` body. Open it in Obsidian — it reads cleanly.

## B. Validation guard (US1)

4. **New Project** → try to save with no milestone (or blank title/capability).
5. **Expect**: save is blocked; the missing requirement is indicated. Only the Course's own milestones appear in the picker.

## C. Reference a Resource (US1)

6. Register/choose a Resource (e.g. a textbook) and add it to the Project with locator "Ch. 6".
7. **Expect**: the reference shows on the Project; re-opening edit shows the locator.

## D. Work it → in-progress via a session (US2)

8. Plan a Daily-Loop session on this Course; in the planner, set **Work block for project (optional)** to this Project. Save the plan.
9. **Expect**: the Project flips to `in-progress`; its vault file's frontmatter `status:` becomes `in-progress` (open in Obsidian to confirm the file updated — and that your `## Work` notes, if you wrote any, are untouched).

## E. Body is never clobbered (US2 / Constitution I)

10. In Obsidian, write some real work under `## Work` (a few lines). Back in the app, edit the Project's capability and save.
11. **Expect**: the frontmatter updates but your `## Work` prose is preserved exactly. No diff dialog, no lost text.

## F. Close with reflection + spawn a card (US2)

12. **Close…** the Project → choose **Complete** → write a short reflection ("kept dropping the sign on the eigenvector") → **Add card**, fill front/back ("Sign check when normalizing eigenvectors?" / "…") → Confirm.
13. **Expect**: status → `complete`, closed date set; the vault file gains a `## Reflection (closed …)` block with your prose (existing body intact); the new card appears in the **Review** queue, linked to the Project. **Nothing** was auto-marked mastered and no card was created you didn't author.

## G. Set aside is neutral (US2 / Constitution III)

14. On another `open`/`in-progress` Project, **Close… → Set aside** (no reflection, no cards). The UI label is deliberately neutral — closing without claiming mastery isn't a failure. The DB/vault status enum is `abandoned` (a stable code name; UI copy is decoupled from stored values).
15. **Expect**: stored status → `abandoned` with a closed date, presented neutrally as "set aside" (no "failed"/penalty framing). No cards spawned.

## H. Rescan round-trip (US3)

16. In Obsidian, create a new `.md` with valid `cic-type: project` frontmatter (**`course-id`** = an existing Course's `cic-id` — copy it from that Course's MOC frontmatter; `course` title is display-only and not used to resolve the link), a capability, status: open, a real milestone id) — or edit an existing Project's frontmatter `capability`. Save.
17. In the app, trigger a rescan (boot or the rescan affordance). **Expect**: the hand-authored Project is imported (or the edit reflected) with its capability/status/milestones intact. A malformed Project file is skipped, not crashed.

## I. Dashboard visibility (US3)

18. Go to the dashboard.
19. **Expect**: active (`open`/`in-progress`) Projects show grouped by Domain with a link to the Course; a Domain with no active Projects shows none (no fabricated entries).

## J. Delete — detach vs delete-file (US3 / Constitution I)

20. Delete a Project → choose **Detach**. **Expect**: it disappears from the app, the vault file remains, and a rescan does **not** re-import it (its `cic-type`/`cic-id` were stripped).
21. Delete another → **Delete the file too** → confirm. **Expect**: the file is removed. If you'd edited it in Obsidian since the app last wrote it, you're warned and must **Delete anyway** to proceed.

---

**Done when** A–J all behave as described, with the vault files clean and human-readable and the freeform bodies never clobbered. The Vitest suite (pure doc module, repository, sync round-trip, UI) must also be green, plus tsc + ESLint + `vite build`. (No `src-tauri/` change this feature, so `cargo` is unaffected — a `cargo check` should still pass unchanged.)
