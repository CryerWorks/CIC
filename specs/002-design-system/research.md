# Research: Obsidian Design System

**Feature**: 002-design-system · **Date**: 2026-05-27

All decisions below resolve the Technical Context. No `NEEDS CLARIFICATION` remain. Token values are quoted from the canonical [CIC-Design-Language-Obsidian.html](../../CIC-Design-Language-Obsidian.html) `:root` block.

---

## R1 — Tailwind v4, CSS-first, via `@tailwindcss/vite`

**Decision**: Tailwind CSS **v4**, configured CSS-first with `@import "tailwindcss";` + an `@theme { … }` block in `src/styles/theme.css`, wired through the official **`@tailwindcss/vite`** plugin (added to the Vite 7 config from Feature 001). No `tailwind.config.js`.

**Rationale**: v4's `@theme` makes design tokens and Tailwind utilities the *same* artifact — each `@theme` entry (e.g. `--color-surface`) both emits a utility (`bg-surface`) **and** publishes a real CSS custom property under `:root`. That single mechanism satisfies FR-001 (token set), FR-004 (runtime-themeable CSS variables for a future light theme), and the "no raw hex in components" rule (SC-006) at once. `@tailwindcss/vite` is first-party and integrates cleanly with the existing Vite 7 / React 19 setup; no PostCSS chain to hand-assemble.

**Alternatives considered**: *Tailwind v3 (JS config)* — rejected: tokens would live in `tailwind.config.ts` as JS, **separate** from the emitted CSS variables, so runtime theming (FR-004) needs a parallel hand-maintained `:root` block — duplication and drift. *Plain CSS + hand-rolled variables, no Tailwind* — rejected: the constitution locks Tailwind, and we'd lose utility ergonomics for the 16 components.

---

## R2 — Token mapping: design-doc vars → semantic role tokens

**Decision**: Re-express the design doc's `:root` variables as **semantic role tokens** in `@theme`, not as literal names. The mapping (full table in [contracts/tokens.md](contracts/tokens.md)):

| Design-doc var | Value | Tailwind `@theme` token | Utility example |
|---|---|---|---|
| `--bg` | `#1a1a1a` | `--color-surface` | `bg-surface` |
| `--bg-2` | `#151515` | `--color-surface-sunken` | `bg-surface-sunken` |
| `--panel` | `#1e1e1e` | `--color-panel` | `bg-panel` |
| `--panel-2` | `#222` | `--color-panel-header` | `bg-panel-header` |
| `--panel-3` | `#262626` | `--color-panel-raised` | `bg-panel-raised` |
| `--line` | `#2c2c2c` | `--color-line` | `border-line` |
| `--line-bright` | `#3a3a3a` | `--color-line-bright` | `border-line-bright` |
| `--accent` | `#8b6cef` | `--color-brand` | `text-brand` / `bg-brand` |
| `--accent-dim` | `#5b48a0` | `--color-brand-dim` | — |
| `--accent-soft` | `rgba(139,108,239,.14)` | `--color-brand-soft` | `bg-brand-soft` |
| `--ai` | `#00bfbc` | `--color-ai` | `text-ai` (AI only) |
| `--green` | `#44cf6e` | `--color-success` | — |
| `--amber` | `#e0a72e` | `--color-warn` | — |
| `--red` | `#fb464c` | `--color-danger` | — |
| `--blue` | `#4c8dff` | `--color-info` | — |
| `--ink` | `#dadada` | `--color-text` | `text-text` |
| `--ink-dim` | `#9a9a9a` | `--color-text-dim` | `text-text-dim` |
| `--ink-faint` | `#666` | `--color-text-faint` | `text-text-faint` (see R5) |
| `--d1…--d5` | (cycle) | `--color-domain-1…5` | — |
| `--r` / `--r-sm` | `8px` / `5px` | `--radius-DEFAULT` / `--radius-sm` | `rounded` / `rounded-sm` |
| `--ui` | Inter stack | `--font-ui` | `font-ui` |
| `--mono` | JetBrains Mono stack | `--font-mono` | `font-mono` |

**Rationale**: Components reference *roles* (`surface`, `brand`, `text-dim`), never `bg`/`accent`. This is what makes FR-004 true — a light theme is a second value-set for the same role names, and component code never changes. Semantic names also document intent (`bg-panel-raised` reads better than `bg-panel-3`).

**Alternatives considered**: *Keep the doc's literal names* (`bg`, `accent`, `ink`) — rejected: they encode the current (dark) values into the name, fighting FR-004 and obscuring role. A spacing scale and the base type rhythm (13.5px / 1.55) are carried over as `--text-*` / `--spacing-*` entries; exact scale enumerated in the token contract.

---

## R3 — Self-hosted fonts (deliberate divergence from the design doc) ⚠️

**Decision**: Vendor the fonts locally via **Fontsource variable packages** — `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` — imported once in `src/styles/fonts.ts` (pulled into `main.tsx`). Vite bundles their `.woff2` into `dist/assets`; the app fetches them from disk, never the network.

**Rationale**: **The canonical design doc loads fonts from the Google Fonts CDN** (`<link rel="preconnect" href="https://fonts.googleapis.com">` and a `fonts.googleapis.com/css2?family=Inter…` stylesheet, lines 7–9). That is fine for a static HTML mockup but is a **direct violation of CLAUDE.md guardrail #1 / Constitution Principle II** for the app: it is an outbound network request, and one that cannot be allowed even under local-only lockdown. So 002 **intentionally diverges from the reference doc here** — the look is identical, the delivery is local. Fontsource variable packages cover Inter weights 400–800 and JetBrains Mono 400–600 (the weights the doc uses) in one axis each, minimizing files.

**Alternatives considered**: *Google Fonts CDN like the doc* — **rejected outright** (guardrail). *Manually download `.woff2` + hand-write `@font-face`* — works and is fully local, but Fontsource is the same outcome with versioned, updatable packages and correct `unicode-range`/`font-display` defaults; less hand-maintenance. *System fonts only* — rejected: loses the Inter/JetBrains identity the design language specifies.

**FOUC/CLS note**: use `font-display: swap` (Fontsource default) with a metric-similar fallback stack (`-apple-system, system-ui, sans-serif` for UI; `ui-monospace, monospace` for code) already present in the doc's `--ui`/`--mono` — keeps first paint instant and swap shift-free (edge case in spec).

---

## R4 — Dark-first theming architecture

**Decision**: Ship **dark only**. Define the role tokens' dark values in the `@theme` block (which lands them on `:root`). Reserve the mechanism for a future light theme as a `[data-theme="light"]` attribute selector that re-declares the same role variables — *not* delivered now. Components reference role tokens exclusively, so adding light later touches only one CSS block.

**Rationale**: FR-004 requires the *capability* without the *cost*. Because `@theme` tokens are CSS variables, a light theme is purely additive — no component edits. Building the light value-set now would be unverifiable scope (no light comps designed) and is explicitly out of scope.

**Alternatives considered**: *Two themes now* — rejected (out of scope, unverifiable). *Hard-code dark values directly in components* — rejected: violates FR-004/SC-006 and makes light impossible without a rewrite.

---

## R5 — Accessibility & contrast strategy (incl. the `--ink-faint` finding) ⚠️

**Decision**: Treat WCAG **AA** as a gate (FR-007/SC-003), verified by a **programmatic contrast test** (`src/styleguide/contrast.test.ts`) that computes the ratio for every foreground/surface pairing the theme defines and asserts the AA threshold for that pairing's intended text size. Per-component keyboard + semantic-HTML requirements (FR-006) are met by construction and spot-checked in component tests; a full keyboard/screen-reader pass is a manual walkthrough step.

**Finding (senior accessibility review)**: an audit of the doc's text tokens on `--bg #1a1a1a`:

| Token | Value | Contrast on `--bg` | AA normal (4.5:1) | AA large/UI (3:1) |
|---|---|---|---|---|
| `--ink` text | `#dadada` | ~12.5:1 | ✅ | ✅ |
| `--ink-dim` text-dim | `#9a9a9a` | ~6.2:1 | ✅ | ✅ |
| **`--ink-faint` text-faint** | **`#666`** | **~3.0:1** | **❌ FAIL** | ✅ |
| `--accent` brand-as-text | `#8b6cef` | ~4.55:1 | ✅ (borderline) | ✅ |
| `--ai` ai-as-text | `#00bfbc` | ~7.6:1 | ✅ | ✅ |

**Resolution**: `--color-text-faint` (`#666`) MUST NOT be used for body-size essential text. Two permitted remedies, recorded in the token contract: **(a)** restrict `text-faint` to large/non-essential decorative labels (≥ the 3:1 use case), which is how the design doc actually uses it (10–11px *de-emphasized* meta), **or (b)** introduce `--color-text-faint-aa` (~`#8a8a8a`, ≥4.5:1) for any faint text that conveys real information. The contrast test encodes this: faint is asserted only at the 3:1 threshold and flagged if used for primary content. Also noted: `brand`-as-text is a borderline 4.55:1 — fine for links, but brand is not for long body copy.

**Alternatives considered**: *Silently keep `#666` everywhere* — rejected: violates SC-003. *Lighten the whole faint ramp globally* — rejected: changes the design doc's intended visual weight; the targeted rule preserves the look while staying compliant. *Drop to WCAG A* — rejected: spec mandates AA.

**Optional tooling**: `eslint-plugin-jsx-a11y` would mechanically catch missing roles/labels and directly serve FR-006. **Recommended**, but flagged for the user — a base ESLint config doesn't exist yet (deferred in 001), and adding one is a small scope addition. Decision deferred to `/speckit-tasks` / user.

---

## R6 — Component-kit architecture (presentational leaf modules)

**Decision**: Each primitive is a small, **presentational** React component in `src/components/ui/`, typed with explicit prop/variant unions (`src/components/ui/types.ts`), styled only from role tokens, exported through a single `index.ts` barrel (the kit's public interface). No component holds state beyond pure UI display state, fetches data, or calls anything.

**Rationale**: Matches CLAUDE.md `src/components/`. Keeps the kit a **leaf** in the module graph (Principle IV) — it depends on nothing but tokens, so Features 004+ compose it freely without coupling to infrastructure. Explicit variant unions give consumers a typed contract (no `any`).

**Principle III constraint (recorded)**: the **Card** (flashcard) and **Rating** primitives are *visual shells only*. They MUST NOT implement reveal-before-recall, auto-flip, or grade-to-schedule logic — that behavior is a desirable-difficulty mechanism owned by the SRS feature that later consumes these shells. In 002 they render static faces/buttons in the StyleGuide. Encoding recall-gating here would pre-empt (and risk smoothing away) a core learning mechanism.

**Alternatives considered**: *A component framework (Radix/shadcn)* — deferred, not rejected forever: for primitives this simple, hand-built keeps the dependency surface and the bundle minimal and the markup exactly matches the doc; we can adopt a headless lib later for complex widgets (menus, dialogs) when chrome arrives. *One mega-file* — rejected: unmaintainable, and breaks per-component testing.

---

## R7 — StyleGuide as the application root view

**Decision**: `App.tsx` renders `<StyleGuide />` directly. The StyleGuide lives in `src/styleguide/`, composed of sectioned subcomponents (tokens, type, each component group). It is built to be dropped into a `/style` route verbatim once routing exists.

**Rationale**: FR-009 — routing is Feature 004, so introducing a router now would do 004's job and blur the phase boundary. Mounting the StyleGuide as the root view delivers the same value (it *is* the design reference) with zero routing. The 001 placeholder `App` content is replaced.

**Alternatives considered**: *Add React Router now for a real `/style` path* — rejected: scope-creeps into 004. *Keep the 001 placeholder and only restyle it* — rejected: the user chose a living StyleGuide (the design reference), which is also the acceptance surface for SC-001/SC-002.

---

## R8 — Test strategy

**Decision**:
- **Per-primitive render/semantic tests** (Vitest + Testing Library): each component renders without crashing, emits the correct **semantic element** (e.g. `Button` → `<button>`), and applies the expected variant. Backs FR-005/FR-006.
- **Programmatic contrast test** (`contrast.test.ts`): computes WCAG ratios for the theme's token pairings and asserts AA per R5. Backs SC-003 mechanically (not just a manual eyeball).
- **Manual walkthrough** for full keyboard traversal, focus visibility, reduced-motion, and forced-colors (jsdom can't faithfully verify these).

**Rationale**: Puts the verifiable acceptance criteria (semantics, contrast) under CI-able tests while being honest that true a11y (AT, focus order, motion prefs) needs a human at the running app. Reuses the Vitest harness 001 established.

**Alternatives considered**: *No tests (it's "just CSS")* — rejected: the constitution's quality gates and SC-003/SC-004 demand verifiable a11y; a component kit consumed by every later feature is exactly what should be tested once. *Full automated a11y (axe-core in jsdom)* — partial value but jsdom layout limits make many checks unreliable; revisit when an e2e/browser test harness exists.

---

## Open questions

None. One **user-facing decision deferred to tasks**: whether to add `eslint-plugin-jsx-a11y` in this feature (R5). Light theme, app chrome, routing, data, and AI are out of scope per the spec.
