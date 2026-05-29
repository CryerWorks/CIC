# Contract — Resources UI (011)

## `ResourceForm` (`src/features/resources/ResourceForm.tsx`)

New props/state on top of the Feature-010 form:

| Element | Behaviour |
|---|---|
| **Source file** (file-kinds only: pdf, epub, markdown, video_file, audio) | Replaces the free-text "File path" input for file-kinds. A **"Choose file…"** button calls `SourceFiles.pickFile(kind)`. On a non-null pick, the chosen basename is shown ("Selected: baby-rudin.pdf") and held as a pending source path. If the Resource already has a stored file and none is re-picked, show its current filename with a "Replace…" affordance. |
| **Busy state** (FR-013/R10) | While the import runs (on submit), the submit button shows "Copying…" and is disabled; on failure, a clear inline error is shown and no file is recorded (FR-011/SC-002). |
| **URL** (url-kinds: web_page, video_url) | Unchanged — link field, **no** file picker (FR-006). |
| **Domain** | A "Home domain" `<select>` (options = the vault's Domains + "— none —"). Seeds from the Resource's `domain_id` on edit; submitting sets/clears `domain_id` (FR-012). |
| **Linked courses** | Unchanged from the 010 polish (domain-grouped "add a course" dropdown + removable chips). |

Submit flow (in `useResources.add` / `edit`):

```
1. register/update the Resource row (gets/keeps an id), with domainId.
2. if a file was picked (file-kind):
     path = await sourceFiles.importFile({ sourcePath, resourceId: id, filename })
     update the row's file_path = path
   on importFile rejection → surface error, leave file_path unchanged (no partial state).
3. reconcile course links (existing).
```

Test seam: the component suite injects a fake `SourceFiles` (no real dialog/copy). A test drives "Choose file…" by having the fake's `pickFile` resolve to a path, then asserts the row ends with the internalized `file_path` and the file appears as attached.

## `ResourcesRoute` (`src/features/resources/ResourcesRoute.tsx`)

| Element | Behaviour |
|---|---|
| **Domain filter** | A "Filter by domain" `<select>` (Domains + "All domains"). Selecting one calls `listResources(vaultId, { domainId })` (via `useResources`) so the list shows only that Domain's Resources (SC-007). Default: all. |
| **Resource list row** | May show a small "file attached" indicator for file-kinds with a stored file (optional polish). |

## Citation open (existing surfaces — `CardCitations`, `ReviewCitations`)

No code change required: once a file-kind Resource has an internalized `file_path`, `resourceTarget()` produces a `file://…(#page=N)` target and the **Open** button enables automatically (the previously-grayed action from the user's scenario-E report). A Resource still without a file/URL (e.g. a physical `book`) stays disabled with the locator shown (FR-008) — unchanged.

## Accessibility / conventions

- The "Choose file…" / "Replace…" controls are real `<button>`s; the busy state uses `disabled` + visible label change.
- Domain selects are labelled (`aria-label`/`<label>`); keyboard-operable native `<select>`.
- Errors are inline text (not alert dialogs), consistent with the rest of the app.
