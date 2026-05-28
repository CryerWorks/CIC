# Contract: MOC Document Module (pure)

**Location**: `src/features/courses/moc/` | **Imports allowed**: `zod`, `src/db` enum types only. **No I/O, no React, no vault/db calls.**

This is the single home of the MOC marker contract (R2/R3). Every function is pure and synchronous, so the entire surface is exhaustively unit-testable.

## Types (`model.ts`, `frontmatter.ts`)

```ts
type MilestoneStatus = "todo" | "in-progress" | "done";          // re-uses enums.ts

interface MocMilestoneModel { id: string; capability: string; status: MilestoneStatus; }

interface MocModel {
  id: string;                       // course.id == frontmatter cic-id
  title: string;
  domain: string;                   // domain name
  campaign: string | null;          // campaign title or null
  capability: string;               // paragraph (possibly "")
  milestones: MocMilestoneModel[];  // already in display order
}

interface ParsedMoc { capability: string; milestones: MocMilestoneModel[]; }

class MocParseError extends Error { constructor(readonly detail: string); }

const MocCourseFrontmatterSchema: z.ZodType<{
  "cic-type": "course"; "cic-id": string; title: string; domain: string; campaign: string | null;
}>;
```

## Functions

### `buildFrontmatter(model: MocModel): Record<string, unknown>`
- Returns `{ "cic-type": "course", "cic-id": model.id, title, domain, campaign }`.
- **MUST** produce an object that parses cleanly through `MocCourseFrontmatterSchema`.

### `renderMocBody(model: MocModel): string`
- Returns the full v0.7 templated body: `## Capability` + `cic:capability` markers wrapping the paragraph; `## Milestones` + `cic:milestones` markers wrapping one line per milestone; empty marker pairs for resources/projects/sessions/notes; a `## Reflections` heading with a "user-owned" hint comment.
- Sections appear in canonical order (markers.ts).
- Empty `capability` → markers present with empty inner content. Empty `milestones` → empty `cic:milestones` block.

### `renderMilestoneLine(m: MocMilestoneModel): string` / `parseMilestoneLine(line: string): MocMilestoneModel | { capability; status; id: null }`
- Render: `- [ |/ |x] <capability> <!-- cic:m id=<id> status=<status> -->` with checkbox glyph mirroring status (R3).
- Parse: extract `id`+`status` from the trailing comment (authoritative); `capability` = text between `]` and the comment, trimmed. A line with no/garbled comment → `id: null`, status inferred from checkbox (`[x]`→done else todo) — caller mints an id (user-added milestone).

### `mergeMocBody(existingBody: string, model: MocModel): string`
- For each managed marker pair present in `existingBody`, replace **only** the inner content with freshly rendered content for that section.
- For each managed pair **absent**, insert the full section (heading + markers + content) immediately before `## Reflections` if present, else at end of body.
- All other bytes preserved exactly (headings, blank lines, `## Reflections` and its content, any out-of-marker prose, even prose between marker blocks).
- **Invariants** (unit-tested):
  - *Idempotent on app output*: `mergeMocBody(renderMocBody(m), m) === renderMocBody(m)`.
  - *Preservation*: given any `existingBody`, the substring after the last `<!-- /cic:notes -->` (or any `## Reflections` block) is byte-identical in the output.
  - *No duplication*: merging never produces two pairs of the same marker.

### `parseMocBody(body: string): ParsedMoc | MocParseError`
- Extract the `cic:capability` inner text (trimmed) → `capability`.
- Extract `cic:milestones` inner lines → `milestones[]` (in order) via `parseMilestoneLine`.
- Returns `MocParseError` only when the body is a CIC course MOC shape but structurally unreadable (e.g. an opened marker with no close). A simply-empty section is **not** an error.

### `mocRelPathFor(title: string, taken: string[]): string`
- Returns `Courses/<slug>.md`; `<slug>` is the title trimmed, whitespace-collapsed, with filesystem-illegal characters removed (kept human-readable — not lowercased/dasherized).
- If the candidate is in `taken`, append ` (2)`, ` (3)`, … until unique. **MUST** never return a path already in `taken`.

## Test obligations (Vitest, pure)
- Frontmatter round-trips through the schema; non-course / missing `cic-id` rejected.
- `renderMocBody` snapshot for a course with 0, 1, and N milestones; all three statuses render the right glyph + `status=` token.
- Milestone line render/parse round-trip for each status; user-added line (no comment) parses with `id: null`.
- `mergeMocBody`: idempotency, Reflections preservation across ≥3 merges, inter-section user prose preserved, missing-section re-insertion, no marker duplication.
- `parseMocBody`: extracts capability + milestones; empty sections OK; unterminated marker → `MocParseError`.
- `mocRelPathFor`: slug readability, collision suffixing, never collides with `taken`.
