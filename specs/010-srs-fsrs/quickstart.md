# Quickstart — Native FSRS Spaced Repetition (010)

Manual `npm run tauri dev` validation. Automated Vitest covers the engine, repos, citations, and component behavior; this is the live Tauri + Obsidian round-trip the user runs (the data-integrity surfaces — FSRS scheduling, vault writes, scoping — are unit-tested separately per the Constitution quality gates).

**Setup:** a connected vault (Feature 006) with at least one Domain + Course (Features 004/007).

---

### Scenario A — Author and review a card (US1 + US2, SC-001/008)
1. Open a Course detail (`/courses/:id`); add a card (front "Define a limit", back "…"). It shows as **new**.
2. Go to **Review**. The new card appears; only the **front** is visible.
3. Reveal → the back appears with four grade buttons and a 1–5 confidence control (**nothing pre-selected**).
4. Pick a confidence, grade **Good**. The card reschedules (days out), the next card loads, the count drops.
5. Re-open Review later same day → the graded card is **not** due again (until its new due date).

### Scenario B — Grade monotonicity (SC-002)
Author four identical cards; grade one **Again**, one **Hard**, one **Good**, one **Easy**. Confirm next-due ordering: Again (minutes) < Hard < Good < Easy (days→weeks). Again reappears in the **same** session.

### Scenario C — New-card daily cap (FR-012, R4)
1. Set the cap low (e.g. 3) — `srs.dailyNewCap`.
2. Author 5 new cards on one Course. Open Review → only **3** new cards are offered today; the other 2 wait.
3. Next day (or after advancing the clock) → the remaining new cards appear.

### Scenario D — Calibration / overconfidence (US3, SC-005)
1. Review a card you feel sure about: confidence **5**, but grade **Again**.
2. Open the **Dashboard** → the card appears in **Overconfident**.
3. A card graded **Good** with confidence 4 does **not** appear there.

### Scenario E — Resource registry + citation deep-link (US4, SC-006)
1. **Resources** screen → register a **PDF** (title + file path) and link it to a Course.
2. On a card, add a citation to that Resource with locator `page=10`.
3. In Review, reveal the card → the citation shows; activating it **opens the PDF at page 10** (system viewer).
4. Register a **book** (no file) with a locator → the citation shows the **locator text** (no auto-open, no error).
5. Switch the active vault → the Resources list shows only the new vault's Resources (no cross-vault leak — R6).

### Scenario F — Block-ref into a note (US4, F3.6)
1. On a card, cite a paragraph of an existing vault note.
2. In Obsidian, open that note → a stable `^cic-xxxxxxxx` marker sits at the end of that paragraph; the rest of the note is untouched.
3. Re-cite the same paragraph → **no duplicate** marker is added (idempotent).
4. Edit the note in Obsidian and leave it dirty, then cite again → a **drift conflict** is surfaced (not clobbered); "cite anyway" resolves it.

### Scenario G — Vault switch re-scopes Review + Dashboard (FR-020, SC-004)
With cards in two vaults: the Review queue and the Dashboard due-count show only the active vault's cards; switching vaults updates both **without a restart**; switching back restores the prior queue intact.

### Scenario H — Integrity (FR-024, FR-021)
1. Delete a Course that has cards → its cards (and their reviews/citations) are gone; no orphans on the Dashboard.
2. (Dev) Corrupt a card's `fsrs_state` JSON → Review treats it as a new card and does not crash.

---

**Done when:** A–H pass live, the full Vitest suite is green (engine monotonicity, repo scoping + cap + transaction, citation idempotency, component gating/retrieval-before-reveal), and `tsc` + ESLint + `build` are clean.
