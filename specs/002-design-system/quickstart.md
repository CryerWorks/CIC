# Quickstart: Obsidian Design System

**Feature**: 002-design-system · **Date**: 2026-05-27

Goal: run the app and see the **StyleGuide** — the living design reference rendering every token and every component. Validates SC-001 (token coverage), SC-002 (component coverage), and is the surface for the contrast/keyboard checks.

## Prerequisites

Feature 001 complete and runnable (`npm run tauri dev` opens the window). No new system prerequisites — the additions are npm packages (Tailwind v4, Fontsource fonts).

## Run it

```powershell
npm install          # pulls in tailwindcss, @tailwindcss/vite, the Fontsource fonts
npm run tauri dev    # window opens rendering the StyleGuide
```

The window shows the **StyleGuide** on a charcoal background, in Inter, with the purple brand accent — the Obsidian identity, not the 001 placeholder.

## What you should see (acceptance surface)

| Section | Shows | Criterion |
|---|---|---|
| Palette | every color role swatch, with the **purple "brand"** and **cyan "AI output only"** roles clearly separated and labelled | SC-001, SC-007 |
| Typography | the type scale in Inter; code/data in JetBrains Mono | SC-001 |
| Radius & spacing | the 5/8px radii, pill, spacing rhythm | SC-001 |
| Components | all 16 primitives, each in its primary + key states | SC-002, FR-011 |

## Verify the feature

| Check | How | Criterion |
|---|---|---|
| Fonts are local | Open dev tools → Network, reload. **Zero** requests to `fonts.googleapis.com` / `gstatic.com` (or any external host). Fonts load from `assets/`. | FR-003 / SC-005 |
| Contrast | `npm run test` → `contrast.test.ts` passes (no AA failures). | FR-007 / SC-003 |
| Keyboard | Tab through the StyleGuide: every Button, Segmented control, Checklist item, Rating, and Scratchpad is reachable and operable by keyboard with a visible focus ring. | FR-006 / SC-004 |
| Components render | `npm run test` → each `*.test.tsx` passes (correct semantic element + variant). | FR-005 |
| No tactical HUD | The look is calm Obsidian — no hex grid, scanlines, corner brackets, or boot sequence. | FR-010 |

## Add a token (the right way)

1. Add the role to the `@theme` block in `src/styles/theme.css` (e.g. `--color-text-faint-aa: #8a8a8a;`).
2. Reference it via its utility (`text-text-faint-aa`) — **never** the raw hex in a component.
3. If it's a text/background pairing, add it to `contrast.test.ts`.
4. Add a swatch to the StyleGuide palette section.

## Add a component (the right way)

1. Create `src/components/ui/<Name>.tsx` — presentational, role-token styling only, explicit prop/variant types.
2. If interactive: native semantic element, keyboard-operable, visible focus.
3. Export it from `src/components/ui/index.ts`.
4. Add `src/components/ui/<Name>.test.tsx` (renders + correct semantic element + variant).
5. Render it (all key states) in the relevant `src/styleguide/sections/` section.
6. **Do not** add learning/scheduling logic to Card or Rating — they stay shells (Constitution III / research R6).

## What you will NOT see yet (by design)

No app chrome (left rail/topbar), no routing — the StyleGuide is the root view and becomes `/style` in Feature 004. No data, no SQLite, no AI, no war-room components, no light theme.

## Troubleshooting

- **Plain/serif text or a font flash**: the Fontsource imports aren't loaded in `main.tsx`, or the fallback stack is missing. Fonts must be imported locally; nothing should come from a CDN.
- **Utilities like `bg-surface` do nothing**: `@tailwindcss/vite` isn't in `vite.config.ts`, or `theme.css` isn't imported in `main.tsx`, or the role isn't declared in `@theme`.
- **`contrast.test.ts` fails on a faint pairing**: you used `text-faint` for body text — switch to `text-dim` or `text-faint-aa` (token contract, R5).
