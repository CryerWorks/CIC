# Contract: Project Document Module (`src/features/projects/doc/`)

Pure, IO-free module (mirrors `src/features/courses/moc/`). Render / parse / merge the Project Markdown file. The **frontmatter** is app-managed; the **body** is learner-owned (rendered once at creation, never re-clobbered). All functions are deterministic and unit-tested with no vault/db.

---

## `model.ts`

```ts
export interface ProjectDocModel {
  id: string;                 // project.id → cic-id
  courseId: string;           // course.id → course-id (STABLE link key for rescan)
  title: string;
  courseTitle: string;        // human-readable course label for the reader (display only)
  capability: string;         // one sentence
  status: ProjectStatus;      // open|in-progress|complete|abandoned
  milestoneIds: string[];     // 0..N at read time; ≥1 only enforced at create/save (M3)
  openedDate: string;         // YYYY-MM-DD
  closedDate: string | null;
  template: string | null;    // chosen seed name, reference only
}

export interface ParsedProject {
  frontmatter: ProjectFrontmatter; // validated
  body: string;                    // raw, learner-owned
}

export type ProjectParseError = { kind: "invalid-frontmatter"; issues: string };
```

## `frontmatter.ts`

```ts
export const ProjectFrontmatterSchema: z.ZodType<ProjectFrontmatter>;
// { "cic-type": "project", "cic-id": string, "course-id": string, title: string(min1),
//   course: string (display only), capability: string(min1), status: ProjectStatus,
//   milestones: string[] (default []), opened: string, closed?: string, template?: string }

export function buildFrontmatter(model: ProjectDocModel): Record<string, unknown>;
// Emits the object above (incl. "course-id": model.courseId); omits `closed`/`template` when null.
// `course-id` is the STABLE link rescan resolves by; `course` (title) is display-only (M2).
```

## `templates.ts`

```ts
export type ProjectTemplateName = "math/proof" | "cs/implement" | "freeform";
export const PROJECT_TEMPLATES: ProjectTemplateName[];
export function renderTemplateBody(name: ProjectTemplateName | null, framing?: string | null): string;
// Returns the initial body Markdown (suggested Problem · Approach · Work · Reflection,
// shaped per domain). `null`/unknown name → the `freeform` body. Pure string. Never a validator.
// `framing` (M1): when non-blank, it is woven once into the `## Problem` section of the returned
// body; when blank/omitted, Problem keeps its placeholder. The framing lives ONLY here (creation) —
// it is never stored in the DB or frontmatter.
```

## `render.ts`

```ts
export function renderProjectDoc(model: ProjectDocModel, framing?: string | null): string;
// Full file = frontmatter block + renderTemplateBody(model.template, framing). Used ONCE at creation.
// `framing` is forwarded into the Problem section (M1) and never persisted elsewhere.
```

## `parse.ts`

```ts
export function parseProjectFile(raw: { data: Record<string, unknown>; body: string }):
  ParsedProject | ProjectParseError;
// Validates frontmatter via the schema (discriminate by cic-type: project upstream in rescan).
// Surfaces the body untouched. Never throws.
```

## `merge.ts`

```ts
export function swapFrontmatter(existingBody: string, model: ProjectDocModel): NoteInput;
// Returns { frontmatter: buildFrontmatter(model), body: existingBody } — body kept VERBATIM.
// This is the only "update" path after creation (status/closed changes rewrite frontmatter only).

export function appendReflection(existingBody: string, reflection: string, closedDate: string): string;
// Appends "\n\n## Reflection (closed <date>)\n\n<reflection>" — additive, never overwrites.
// No-op (returns existingBody) when reflection is blank.
```

## `filename.ts`

```ts
export function projectFilename(title: string, id: string): string;
// Slug under "Projects/" with a short id suffix for uniqueness (mirrors moc/filename.ts).
// e.g. "Projects/diagonalize-a-matrix-3f9a2b.md"
```

## `markers.ts`

```ts
export const PROJECT_DISCRIMINATOR = "project"; // cic-type value
// No managed BODY section markers (unlike the MOC) — the body is fully learner-owned.
```

## Invariants (test targets)

- `parseProjectFile` of `renderProjectDoc(model)` yields frontmatter equal to `buildFrontmatter(model)` (including `course-id`) and a body equal to `renderTemplateBody(model.template)`.
- `swapFrontmatter(body, model).body === body` for any `body` (body is never mutated by an update).
- `appendReflection(body, "", date) === body` (blank reflection is a no-op).
- `renderTemplateBody` is total: every `ProjectTemplateName` and `null` returns a non-empty string; no input validates a *body*.
- `renderTemplateBody(name, framing)` with non-blank `framing` contains that framing text under the `## Problem` heading; with blank/omitted framing the Problem placeholder is unchanged (M1).
- `buildFrontmatter(model)["course-id"] === model.courseId` (the stable rescan key; `course` carries the title for display only — M2).
- Malformed frontmatter → `ProjectParseError`, never a throw.
