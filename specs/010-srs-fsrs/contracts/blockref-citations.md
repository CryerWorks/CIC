# Contract — Block-ref insertion & citation deep-linking

Covers F3.6 (block-ref into a vault note) and F3.7 (Resource citation deep-link). The block-ref write is the **only new vault-write surface** in this feature and routes through `VaultWriter` (Constitution I).

## Block-id (pure, `src/features/srs/citations/blockId.ts`)

```ts
/** Deterministic id for a paragraph: "cic-" + first 8 hex of SHA-256(trimmed text). Idempotent. */
export function blockIdFor(paragraph: string): string;

/** Insert ` ^<id>` at the end of the target paragraph if absent; return { body, blockId, changed }.
 *  No-op (changed:false) when the paragraph already ends with that marker. Pure string transform. */
export function ensureBlockMarker(body: string, paragraph: string): {
  body: string; blockId: string; changed: boolean;
};
```

Guarantees (unit-tested, no I/O):
- **Idempotent:** `ensureBlockMarker(ensureBlockMarker(b,p).body, p).changed === false`.
- **Deterministic:** same paragraph ⇒ same id across runs (no `^x ^x` build-up — PRD F7).
- **Targeted:** only the matched paragraph is modified; other content byte-identical.

## Block-ref write (`src/features/srs/citations/blockRef.ts`)

```ts
/** Read note → ensureBlockMarker → write back through VaultWriter. Returns the block-id to store
 *  on the card, or a conflict to surface (never clobbers — honors WriteResult). */
export async function citeNoteParagraph(
  deps: { reader: VaultReader; writer: VaultWriter },
  notePath: string, paragraph: string, opts?: { overwrite?: boolean },
): Promise<
  | { status: "cited"; blockId: string }
  | { status: "absent" }                                   // note missing
  | { status: "unchanged"; blockId: string }               // marker already present
  | { status: "conflict"; reason: "drifted" | "unmanaged"; notePath: string }
>;
```
- Read via `VaultReader.readNote`; if missing → `absent`.
- `ensureBlockMarker` on the body; if unchanged → `unchanged` (still returns the id).
- Write via `VaultWriter.writeNote({ frontmatter, body }, { overwrite })`; on `WriteResult.status==="conflict"` → surface `conflict` (UI offers "cite anyway" → retry with `overwrite:true`), mirroring the 007 reapply pattern.
- On success the caller stores `blockId` in `cards.note_block_id`; the citation renders `[[<note>#^<blockId>]]`.

## Deep-link (`src/features/srs/citations/openTarget.ts`) — R8, best-effort

```ts
/** Build the opener target for a Resource citation from kind + file_path/url + locator. */
export function resourceTarget(resource: Resource, locator: string | null): string | null;
//  pdf:        file://<file_path>#page=<locator>
//  web_page:   <url>[#<locator>]
//  video_url:  <url>[?t=<locator>] (or &t= if url has a query)
//  epub/markdown/video_file/audio: file://<file_path>  (locator shown alongside)
//  book/audio without a file: null  → caller shows the locator text only

/** Open via tauri-plugin-opener; swallow failure into a graceful result (no throw). */
export async function openCitation(target: string | null): Promise<{ opened: boolean }>;
```
- Uses the already-enabled `@tauri-apps/plugin-opener` `open()` (capability `opener:default` — no new native work).
- Wrapped so a missing file / unreachable URL / `null` target degrades to `{ opened: false }`; the UI then shows the locator string and a calm note (FR-017, "no error in either case", SC-006).
- Block-ref note open: best-effort `obsidian://open?...` when resolvable, else the note `file://`.
- The single `open()` call is the only Tauri touch; injected so unit tests stay runtime-free.
