# Quickstart — Source File Import & Local Storage (011)

Manual `npm run tauri dev` validation. Automated Vitest covers the migration, the repo (`domain_id`), and the hook/components (with a fake `SourceFiles`); this is the live Tauri round-trip the suite can't reach — the **native file copy/remove**, the **OS dialog**, and the **opener** deep-link.

**Setup**: a connected vault with at least one Domain + Course, and a real file on disk (e.g. a small PDF).

---

### Scenario A — Internalize a file (US1, SC-001/SC-006)
1. Resources → Register → kind **PDF** → **Choose file…** → pick a PDF on disk → save.
2. The Resource lists with a stored file (filename shown).
3. Confirm the **original file** on disk is unchanged and still in place (copied, not moved — SC-006).
4. (Dev) Confirm a copy exists under the app-local-data dir at `…/resources/<id>/<file>.pdf`.

### Scenario B — Open a cited source at its page (US2, SC-003)
1. On a card in a Course linked to that PDF Resource, add a citation with locator `page=10`.
2. In Review, reveal the card → the citation's **Open** button is now **enabled** (previously gray).
3. Activate it → the PDF opens in the system viewer **at page 10** (where the viewer supports it).

### Scenario C — Re-import replaces, failure-safe (FR-005, R8/F1)
1. Edit the PDF Resource → **Replace…** → pick a *different* file → save.
2. The stored file is the new one; the app-store folder holds exactly one file (the old copy is gone).
3. (Dev, optional) Simulate a failed replace (e.g. pick an unreadable file) → the **previous** file and its `file_path` remain intact (never lost on a failed re-import).

### Scenario D — Delete reclaims storage (US3, SC-004)
1. Delete the PDF Resource.
2. (Dev) Confirm `…/resources/<id>/` is gone — no orphaned copy remains.
3. Delete a Resource whose stored file was already removed out-of-band → deletion still succeeds (FR-009).

### Scenario E — URL kinds keep a link (FR-006)
1. Register a **Web page** Resource → it shows a **URL** field, **no** file picker; no file is stored.
2. Cite it on a card, locator `#section`; Open launches the URL (existing behaviour).

### Scenario F — File a Resource under a Domain + filter (US4, SC-007)
1. Register/edit a Resource → set **Home domain** = Math.
2. Resources → **Filter by domain** = Math → only Math-filed Resources show; switch to another Domain → it disappears; "All domains" shows everything.
3. (Optional) The course-link picker for a Math-filed Resource is grouped/narrowable to Math courses.
4. Delete the **Math** Domain → the delete succeeds and the Resource survives, now **unfiled** (home Domain cleared) — never blocked, never deleted (C1).

### Scenario G — Vault stays clean (Constitution I, SC-005)
1. After importing several files, open the Obsidian vault folder.
2. Confirm it contains **only** Markdown + `.cic` markers — **no** imported binaries anywhere.

### Scenario H — Failure handling (FR-008/FR-011/SC-002)
1. Start an import, then cancel the OS dialog → nothing stored, no error state stuck.
2. Pick a file then make it unreadable mid-flow (or pick from a removed drive) → a clear inline error; the Resource ends with **no** stored file (not half-stored).
3. A `book` Resource (no file, no URL) with a locator → its citation Open stays **disabled**, locator shown — never an error (unchanged).

---

**Done when**: A–H pass live, the full Vitest suite is green (migration v5 + lossless, `domain_id` repo, hook/component with fake `SourceFiles`, citation-open enablement), and `tsc` + ESLint + `build` are clean.
