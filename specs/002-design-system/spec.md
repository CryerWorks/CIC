# Feature Specification: Obsidian Design System

**Feature Branch**: `002-design-system`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Feature 002 — Obsidian design system. Encode the canonical CIC-Design-Language-Obsidian.html into a reusable, themed component layer using Tailwind v4 (CSS-first @theme). Tokens (charcoal surfaces, purple brand, cyan AI-only, Inter + JetBrains Mono, 8px radius, spacing), self-hosted fonts (no CDN), the full component vocabulary as accessible React primitives, and a living StyleGuide view. Accessibility (WCAG AA, keyboard, semantic HTML) is a requirement. App chrome, routing, data, and AI are out of scope."

## User Scenarios & Testing *(mandatory)*

> **Note on "user" for this feature.** CIC's end user is the learner ("the operator"). Feature 002 has no learning functionality yet — it establishes the *visual language* every later screen will be built from. So the immediate beneficiaries are **(a) the developer who will compose real screens out of these themed primitives** (Features 004+), and **(b) anyone — including the operator — who looks at the app and should immediately recognise one calm, consistent Obsidian-style visual identity** rather than unstyled scaffold output. The end learner benefits transitively: every feature they eventually touch inherits this system.

### User Story 1 - The app wears one consistent visual identity (Priority: P1)

The application adopts the canonical Obsidian visual identity — charcoal surfaces, the purple brand accent, reserved AI accent, the type scale in Inter and JetBrains Mono, the radius and spacing rhythm — as a single shared token system. Anyone opening the app sees a deliberate, coherent look instead of default scaffold styling, and a reference view shows the complete token set.

**Why this priority**: This is the foundation the entire UI rests on. Components, screens, and every later feature consume these tokens; none of them can look right until the token layer exists and is correct. It is also the smallest independently shippable slice — tokens applied + visibly documented is real, demonstrable value on its own.

**Independent Test**: Open the app. It renders in the Obsidian theme (dark charcoal, purple accent, correct fonts). The reference view displays the full palette (including the brand-purple vs. AI-cyan distinction), the type scale, the radius scale, and the spacing scale. Verifiable with no components built yet.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** it loads, **Then** it renders in the dark Obsidian theme with Inter for UI text and JetBrains Mono for code/data, and no flash of an unstyled or wrong font.
2. **Given** the reference view, **When** a viewer inspects the palette, **Then** the brand accent (purple) and the AI-reserved accent (cyan) are shown as **distinct, separately-labelled** roles, with the AI accent clearly marked "AI output only".
3. **Given** the app is running with no network access, **When** it loads, **Then** typography renders correctly with zero outbound requests for fonts or other assets.
4. **Given** any themed text on its intended surface, **When** its contrast is audited, **Then** it meets WCAG AA.

---

### User Story 2 - A developer builds screens from a ready-made, accessible component kit (Priority: P2)

A developer composing a future screen reaches for a library of pre-built, themed, accessible React primitives covering the design language's full component vocabulary — panels, buttons, stat cells, tags, checklists, heatmap, stepper, scratchpad, card, rating, message/avatar, citation, callout, annotation, segmented control, and graph node/edge — instead of restyling raw HTML each time. Each primitive already matches the design doc and is keyboard-operable.

**Why this priority**: Tokens alone (US1) make things *look* consistent only if every developer re-derives the same markup. The component kit captures that derivation once, so Features 004+ assemble screens quickly and uniformly. It depends on US1 (components consume tokens) but delivers distinct value: reusable, accessible building blocks.

**Independent Test**: In the reference view, every named component appears in its primary and key interactive/variant states, themed per the design doc. Each interactive component can be operated with the keyboard alone and shows a visible focus state. A developer can import any one primitive into a blank view and it renders correctly themed without extra styling.

**Acceptance Scenarios**:

1. **Given** the component kit, **When** a developer renders any named primitive, **Then** it appears styled per the design doc using only shared tokens (no ad-hoc colours).
2. **Given** an interactive primitive (e.g. button, segmented control, checklist item, rating), **When** the user navigates with the keyboard only, **Then** it is reachable, operable, and shows a visible focus indicator.
3. **Given** an interactive primitive rendered as a semantic element, **When** inspected, **Then** it uses the correct native element (e.g. a button is a `<button>`), not a generic clickable container.
4. **Given** a component receiving overflowing content (long label, many tags), **When** rendered, **Then** it degrades gracefully (wrap/truncate) without breaking the layout.

---

### Edge Cases

- **Font not yet loaded (first paint)**: typography MUST fall back gracefully to a system stack and swap in without layout shift or a blank flash — never block render on a font.
- **Reduced motion**: any transition/animation MUST respect the OS "reduce motion" preference (the design language is calm by intent; motion is purposeful, never required to understand state).
- **Forced-colors / high-contrast mode**: components MUST remain legible and operable (don't rely solely on a colour the OS may override).
- **Overflowing / empty content**: panels, stat cells, tags, and the message component MUST handle very long, very short, and empty content without breaking.
- **The AI accent appears outside an AI context**: this MUST be impossible to do *accidentally* — the AI accent is a separate, clearly-named token, not a general accent a developer would grab by default.
- **Light theme requested**: out of scope for this feature; the system is dark-first. The token architecture must not *prevent* a future light theme, but no light theme is delivered here.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single shared design-token set that encodes the canonical design language: a charcoal surface ramp, primary text/secondary text/muted text roles, border/divider roles, the **purple brand accent** (brand, links, active/selected state), the **cyan AI accent**, a radius scale (8px family), a spacing scale, and the two type families (Inter for UI, JetBrains Mono for code/data) with their size/weight scale.
- **FR-002**: The brand accent and the AI accent MUST be defined as **distinct, non-interchangeable roles**. AI-output styling draws only from the AI-accent role; brand/interactive styling draws only from the brand role. The two MUST NOT be aliases of each other, and the system MUST make the AI accent the obviously-wrong choice for general UI (so the "cyan = AI only, never reverse" rule is structural, not a convention to remember).
- **FR-003**: All fonts MUST be served from local application assets. The running app MUST make **no outbound network request** for fonts or any other design asset (fully-local guardrail).
- **FR-004**: The theme MUST be dark-first and expressed as semantic, themeable variables such that components reference **role tokens** (e.g. "surface", "brand", "primary text") rather than literal colour values — so a future light theme can be introduced without changing component code. No component may hard-code a raw colour value.
- **FR-005**: The system MUST provide reusable, themed primitives for the full component vocabulary: **Panel, Button (with its variants), StatCell, Tag, Checklist, Heatmap, Stepper, Scratchpad, Card, Rating, Message/Avatar, Citation, Callout, Annotation, Segmented control, and Graph node/edge**. Each MUST visually match the canonical design doc and consume only shared tokens.
- **FR-006**: Every interactive primitive MUST be fully operable by keyboard alone (focusable, activatable, arrow-navigable where applicable) and MUST render a **visible focus indicator**; interactive elements MUST use semantically correct HTML.
- **FR-007**: All foreground/background colour pairings the theme produces MUST meet **WCAG AA** contrast (≥ 4.5:1 for body text, ≥ 3:1 for large text and meaningful UI boundaries).
- **FR-008**: The system MUST provide a **living StyleGuide view** that renders every token (palette with role labels, type scale, radius scale, spacing scale) and every component (in its primary and key interactive/variant states). This view is the design reference and the feature's acceptance surface.
- **FR-009**: The StyleGuide MUST be the application's visible view for this feature and MUST be structured so it can be mounted at a dedicated location (the future `/style` route) once application routing exists, without rework of its content.
- **FR-010**: The visual identity MUST follow the calm Obsidian aesthetic only. The war-room **tactical-HUD** aesthetic (hex-grid backdrops, scanlines, corner brackets, boot-up sequence) MUST NOT be introduced.
- **FR-011**: Each component's available variants and states MUST be discoverable from the StyleGuide (i.e. the reference shows, not just tells, what each component can do), so a developer can choose the right primitive/state without opening the original source document.

### Key Entities

This feature introduces **no persisted data**. Its "entities" are conceptual:

- **Design token**: a named, role-based visual value (colour, type, radius, spacing) sourced from the canonical design doc; the single source of styling truth that components consume.
- **Component primitive**: a reusable, presentational UI building block from the design vocabulary, styled entirely from tokens and free of business logic, data, or AI behaviour.
- **StyleGuide**: the in-app catalogue that renders all tokens and primitives as the living design reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **100%** of the colour, type, radius, and spacing tokens defined in the canonical design doc are represented in the system and visible in the StyleGuide.
- **SC-002**: **100%** of the named component vocabulary appears in the StyleGuide, each shown in its primary state plus its key interactive/variant states.
- **SC-003**: A contrast audit of the theme's foreground/background pairings yields **zero** WCAG AA failures.
- **SC-004**: **Every** interactive component is fully operable using the keyboard alone, with a visible focus indicator — zero components that require a pointer.
- **SC-005**: With networking disabled, the app renders with correct typography and theme and shows **zero** outbound asset (font/image) requests.
- **SC-006**: **Zero** raw colour values appear in component code outside the central token definitions (all styling flows through role tokens) — confirming a future theme swap touches only the token layer.
- **SC-007**: The AI-reserved accent is used by **zero** brand/interactive elements; the StyleGuide explicitly labels it AI-only — a reviewer can confirm the cyan/purple rule holds at a glance.
- **SC-008**: A contributor who has never read the original design HTML can, from the StyleGuide alone, pick the correct token and component for a described UI need in under 2 minutes.

## Assumptions

- **The canonical source is `CIC-Design-Language-Obsidian.html`.** Where the description is silent on a specific value, the evident system in that document governs. The two named brand/AI colours (purple, cyan) and the stated scales come from it.
- **Dark-first; light theme deferred.** A light theme is explicitly out of scope; the only requirement on it here is that the token architecture not *preclude* it later (FR-004).
- **No application routing yet** (Feature 004). The StyleGuide is therefore the app's root view for now and is built to graduate to a `/style` route later (FR-009).
- **No data and no AI** exist yet. Components are purely presentational; the AI accent is enforced by token structure but no AI output exists to render. Any component that would normally show dynamic data (Heatmap, Graph, Rating, Message) is shown in the StyleGuide with **static representative sample content**, not wired to real data or an interactive engine.
- **Self-hosted fonts**: the Inter and JetBrains Mono files are vendored into the application's local assets.
- **Builds on Feature 001's shell** (the running Tauri + React + Vite window); this feature changes what that window renders, not how it launches.

### Out of Scope (Feature 002 — deferred)

- Application chrome (left rail, topbar) and the routing system — **Feature 004**.
- Any data, SQLite, or persistence — **Feature 003**.
- AI features and provider wiring — later phase.
- Porting war-room components — **Feature 005+**.
- A working **light theme** (only the *capability* to add one later is required).
- Wiring Heatmap / Graph / Rating / Message to real data or interactive engines (static samples only).
- Production packaging / signing.
